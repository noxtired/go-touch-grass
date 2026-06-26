/* ============================================================
   Go Touch Grass — Todays Sidequests flow
   loading → sidequests → (choose) → camera → review → completed
   + blocking mode with confirmation popup.
   Uses window.QUEST_POOL (quests.js).
   ============================================================ */
(function () {
  "use strict";

  var POOL = window.QUEST_POOL || {};
  // shapes used by the loading shuffle (one set per category colour)
  var CAT_SHAPES = {
    outside: ["action", "discovery", "outside", "scavenger_hunt"],
    indoor:  ["creative", "indoors", "selfcare", "tasks"],
    social:  ["activity", "encounter", "game", "social"]
  };

  var screens = {};
  var video, fileInput, scrim, archiveScrim, unblockScrim, deleteImageScrim, permsScrim;
  var expHeadline, expFly, expShape, expLevelNum;
  var seqTimers = [];
  var cam = { stream: null, facing: "environment", track: null, torch: false, multiple: undefined };
  var crop = { natW: 0, natH: 0, cover: 1, s: 1, x: 0, y: 0, b: 300, dragging: false, sx: 0, sy: 0, spx: 0, spy: 0 };
  var state = {
    daily: [], chosen: null, photo: null, landscape: false, blocking: false, selected: new Set(),
    detailId: null, justCompletedId: null, archivingId: null, expAnim: null,
    screen: "loading", pendingPic: "", selectingBlocked: false, blockedSel: new Set(),
    archivedId: null, pendingPermSw: null
  };
  var MAIN_CATS = ["outside", "indoor", "social"];

  var $ = function (s, r) { return (r || document).querySelector(s); };
  function rand(n) { return Math.floor(Math.random() * n); }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

  /* ---------- daily quests (persist per calendar day) ---------- */
  function todayKey() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function pickDaily() {
    return ["outside", "indoor", "social"].map(function (cat) {
      var cd = POOL[cat];
      var sub = cd.subcategories[rand(cd.subcategories.length)];
      var desc = sub.quests[rand(sub.quests.length)];
      return { category: cat, color: cat, sub: sub.key, subLabel: sub.label, shape: sub.shape, description: desc, blocked: false };
    });
  }
  function loadDaily() {
    try {
      var raw = localStorage.getItem("gtg_daily");
      if (raw) { var d = JSON.parse(raw); if (d.date === todayKey() && Array.isArray(d.quests) && d.quests.length === 3) return d.quests; }
    } catch (e) {}
    var q = pickDaily(); saveDaily(q); return q;
  }
  function saveDaily(q) { try { localStorage.setItem("gtg_daily", JSON.stringify({ date: todayKey(), quests: q })); } catch (e) {} }

  /* one sidequest may be completed per day — lock "Todays Sidequests" until the next day */
  function loadCompleted() { try { return JSON.parse(localStorage.getItem("gtg_completed")) || {}; } catch (e) { return {}; } }
  function isDoneToday() { return loadCompleted().date === todayKey(); }
  function markDoneToday() {
    var q = state.chosen || {};
    try {
      localStorage.setItem("gtg_completed", JSON.stringify({
        date: todayKey(), id: state.justCompletedId,
        quest: { color: q.color, shape: q.shape, subLabel: q.subLabel, description: q.description, landscape: !!state.landscape, date: formatDate(new Date()) }
      }));
    } catch (e) {}
  }

  /* ---------- EXP / levels ---------- */
  function levelFromXP(xp) { return Math.floor(1 + 99 * Math.pow(xp / 3650, 1 / 1.8)); }
  function xpForLevel(L) { return 3650 * Math.pow((L - 1) / 99, 1.8); }
  function levelProgress(xp) {
    var L = levelFromXP(xp), lo = xpForLevel(L), hi = xpForLevel(L + 1);
    return hi > lo ? Math.max(0, Math.min(1, (xp - lo) / (hi - lo))) : 0;
  }
  function fillDisplay(prog) { return Math.min(95, 12 + 88 * prog).toFixed(2) + "%"; }   // sliver at 0, never reads completely full (cap 95)
  function xpAll() { try { return JSON.parse(localStorage.getItem("gtg_xp")) || {}; } catch (e) { return {}; } }
  function getXp(cat) { return xpAll()[cat] || 0; }
  function setXp(cat, v) { var a = xpAll(); a[cat] = v; try { localStorage.setItem("gtg_xp", JSON.stringify(a)); } catch (e) {} }

  /* ---------- gallery (completed quests, persisted) ---------- */
  function loadGallery() { try { return JSON.parse(localStorage.getItem("gtg_gallery")) || []; } catch (e) { return []; } }
  function saveGallery(g) { try { localStorage.setItem("gtg_gallery", JSON.stringify(g)); return true; } catch (e) { return false; } }
  /* ---------- archive (quests moved out of the gallery; surfaced in settings later) ---------- */
  function loadArchive() { try { return JSON.parse(localStorage.getItem("gtg_archive")) || []; } catch (e) { return []; } }
  function saveArchive(a) { try { localStorage.setItem("gtg_archive", JSON.stringify(a)); } catch (e) {} }
  function archiveRecord(id) {
    var rec = null, rest = [];
    loadGallery().forEach(function (r) { if (r.id === id && !rec) rec = r; else rest.push(r); });
    if (rec) { var arch = loadArchive(); arch.push(rec); saveArchive(arch); saveGallery(rest); }
  }

  /* ---------- settings stores ---------- */
  function loadProfile() { try { return JSON.parse(localStorage.getItem("gtg_profile")) || {}; } catch (e) { return {}; } }
  function saveProfile(p) { try { localStorage.setItem("gtg_profile", JSON.stringify(p)); } catch (e) {} }
  function loadBlocked() { try { return JSON.parse(localStorage.getItem("gtg_blocked")) || []; } catch (e) { return []; } }
  function saveBlocked(b) { try { localStorage.setItem("gtg_blocked", JSON.stringify(b)); } catch (e) {} }
  function loadPerms() { try { return JSON.parse(localStorage.getItem("gtg_perms")) || {}; } catch (e) { return {}; } }
  function savePerms(p) { try { localStorage.setItem("gtg_perms", JSON.stringify(p)); } catch (e) {} }
  function loadPrefs() { try { return JSON.parse(localStorage.getItem("gtg_prefs")) || {}; } catch (e) { return {}; } }
  function savePrefs(p) { try { localStorage.setItem("gtg_prefs", JSON.stringify(p)); } catch (e) {} }
  var MAX_BLOCKED = 40;
  function addBlocked(q) {
    var b = loadBlocked();
    var key = q.category + "|" + q.sub + "|" + q.description;
    if (b.length >= MAX_BLOCKED) return;
    if (b.some(function (r) { return (r.category + "|" + r.sub + "|" + r.description) === key; })) return;
    b.push({ category: q.category, color: q.color, sub: q.sub, subLabel: q.subLabel, shape: q.shape, description: q.description });
    saveBlocked(b);
  }
  /* avatar markup from a stored pic (svg key, uploaded data-URL, or none) */
  function avatarHTML(pic) {
    if (!pic) return '<img src="assets/svg/logo_green.svg" alt="">';   // default avatar = the app logo
    if (pic.indexOf("data:") === 0) return '<img src="' + pic + '" alt="">';
    return '<img src="assets/svg/profile-pics/' + pic + '.svg" alt="">';
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function formatDate(d) { return pad2(d.getDate()) + "." + pad2(d.getMonth() + 1) + "." + d.getFullYear(); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* shrink a captured/uploaded photo before storing it (keeps localStorage small) */
  function downscaleImage(src, maxEdge, quality, cb) {
    var img = new Image();
    img.onload = function () {
      var w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) { cb(null); return; }
      var scale = Math.min(1, maxEdge / Math.max(w, h));
      var c = document.createElement("canvas");
      c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      try { cb(c.toDataURL("image/jpeg", quality)); } catch (e) { cb(null); }
    };
    img.onerror = function () { cb(null); };
    img.src = src;
  }

  /* turn the finished quest into a gallery record (with a small stored photo) */
  function addToGallery() {
    var q = state.chosen; if (!q) return;
    var rec = {
      id: "q" + Date.now(),
      category: q.category, color: q.color, sub: q.sub, subLabel: q.subLabel,
      shape: q.shape, description: q.description,
      landscape: !!state.landscape, date: formatDate(new Date()), photo: null
    };
    state.justCompletedId = rec.id;
    downscaleImage(state.photo, 1080, 0.82, function (small) {
      rec.photo = small || state.photo;
      var g = loadGallery(); g.push(rec);
      if (!saveGallery(g)) {                 // storage full → drop oldest until it fits
        while (g.length > 1 && !saveGallery(g)) { g.shift(); }
      }
    });
  }

  /* auto-sequence timers (cancelable if the user navigates away) */
  function seqAfter(ms, fn) { seqTimers.push(setTimeout(fn, ms)); }
  function clearSeq() { seqTimers.forEach(clearTimeout); seqTimers = []; }

  /* ---------- markup ---------- */
  function questCard(q, idx, interactive) {
    if (interactive === undefined) interactive = true;
    var attrs = (idx != null ? ' data-idx="' + idx + '"' : "") + (interactive ? ' role="button" tabindex="0"' : "");
    return '<article class="quest-card cat-' + q.color + ' qs-' + q.shape + (q.blocked ? " is-blocked" : "") + (interactive ? "" : " quest-card--static") + '"' + attrs + ">"
      + '<span class="quest-card__tag">' + esc(q.subLabel) + "</span>"
      + '<span class="quest-card__shape"></span>'
      + '<p class="quest-card__desc">' + esc(q.description) + "</p>"
      + "</article>";
  }
  function buildOverview(o) {
    var photo = o.imageDeleted ? '<span class="photo-deleted">This image has been deleted</span>'
      : (o.photo ? '<img src="' + o.photo + '" alt="Proof photo">' : '<span class="img-placeholder"></span>');
    var chk = o.check ? '<span class="photo-check"><img src="assets/svg/checkmark.svg" alt=""></span>' : "";
    var date = o.date ? '<div class="quest-overview__date">' + esc(o.date) + "</div>" : "";
    return '<article class="quest-overview cat-' + o.color + ' qs-' + o.shape + '">'
      + '<span class="quest-card__tag">' + esc(o.subLabel) + "</span>"
      + '<div class="quest-overview__head">'
      + '<span class="quest-card__shape"></span>'
      + '<p class="quest-card__desc">' + esc(o.description) + "</p>"
      + "</div>"
      + '<div class="photo photo--' + (o.landscape ? "wide" : "long") + (o.imageDeleted ? " photo--deleted" : "") + '">' + photo + chk + "</div>"
      + date
      + "</article>";
  }
  function overview(q, check) {
    return buildOverview({
      color: q.color, shape: q.shape, subLabel: q.subLabel, description: q.description,
      photo: state.photo, landscape: state.landscape, check: check
    });
  }
  function renderSidequests() { $("#questList").innerHTML = state.daily.map(function (q, i) { return questCard(q, i); }).join(""); }

  /* ---------- router ---------- */
  var QUEST_SCREENS = { loading: 1, sidequests: 1, camera: 1, review: 1, completed: 1, exp: 1, summary: 1, welcome: 1, firstname: 1, "firstname-confirm": 1 };
  var NO_FADE = { camera: 1, "set-pfp": 1, "set-crop": 1 };
  var ONBOARD = { welcome: 1, firstname: 1, "firstname-confirm": 1 };   // bar inert during onboarding
  var NO_NAV = { welcome: 1, firstname: 1, "firstname-confirm": 1 };    // bar hidden through onboarding (incl. the logo animation)
  function show(name) {
    state.screen = name;
    Object.keys(screens).forEach(function (k) { screens[k].classList.toggle("is-active", k === name); });
    if (name !== "camera") stopCamera();
    if (name === "sidequests") renderSidequests();
    else if (name === "profile") renderProfile();
    else if (name === "settings") renderPrefs();
    else if (name === "set-profile") renderSetProfile();
    else if (name === "set-pfp") renderPfp();
    else if (name === "set-title") renderTitle();
    else if (name === "set-blocked") renderBlocked();
    else if (name === "set-archived") renderArchived();
    else if (name === "set-permissions") renderPermissions();
    var bar = document.querySelector(".bottom-bar");
    if (bar) bar.setAttribute("data-active", QUEST_SCREENS[name] ? "quests" : "profile");
    var app = document.querySelector(".app");
    app.classList.toggle("no-fade", !!NO_FADE[name]);
    app.classList.toggle("onboarding", !!ONBOARD[name]);
    app.classList.toggle("no-nav", !!NO_NAV[name]);
    var el = screens[name]; if (el) el.scrollTop = 0;
  }

  /* ---------- loading shuffle ---------- */
  var shuffleTimer = null;
  function preloadShapes() {       // warm the cache so shuffle src-swaps are instant (switch ↔ move stay in sync)
    var seen = {};
    Object.keys(CAT_SHAPES).forEach(function (cat) {
      CAT_SHAPES[cat].forEach(function (name) {
        if (seen[name]) return; seen[name] = 1;
        var im = new Image(); im.src = "assets/svg/shapes/" + name + "_color.svg";
      });
    });
  }
  function startShuffle() {
    var slots = document.querySelectorAll("#loadingShapes .loading-shape");
    var idx = [0, 0, 0];
    var turn = 0;
    shuffleTimer = setInterval(function () {
      // advance one category per tick (cascading)
      var i = turn % slots.length;
      var slot = slots[i];
      var list = CAT_SHAPES[slot.getAttribute("data-cat")] || [];
      idx[i] = (idx[i] + 1) % list.length;
      var img = slot.querySelector("img");
      // swap the source THEN restart the entrance, so the new shape is what moves
      img.style.animation = "none";
      img.src = "assets/svg/shapes/" + list[idx[i]] + "_color.svg";
      void img.offsetWidth;
      img.style.animation = "";
      turn++;
    }, 280);
  }
  function stopShuffle() { if (shuffleTimer) { clearInterval(shuffleTimer); shuffleTimer = null; } }

  /* shows the loading shuffle, then the daily sidequests */
  function goLoading() {
    show("loading");
    startShuffle();
    setTimeout(function () { stopShuffle(); if (state.screen === "loading") show("sidequests"); }, 2600);
  }

  /* ---------- first-time onboarding ---------- */
  function playWelcome() {
    var w = screens.welcome;
    w.classList.remove("s1", "s2", "s3");
    show("welcome");
    requestAnimationFrame(function () { w.classList.add("s1"); });         // logo pops in
    setTimeout(function () { w.classList.add("s2"); }, 1100);              // welcome text reveals
    setTimeout(function () { w.classList.add("s3"); }, 2600);              // logo leaves, only the text remains
    setTimeout(function () { show("firstname"); setTimeout(function () { $("#firstnameInput").focus(); }, 60); }, 3800);
  }
  function confirmName() {
    var v = $("#firstnameInput").value.trim();
    if (!v) { $("#firstnameInput").focus(); return; }
    $("#confirmName").textContent = v + ", is that right?";
    show("firstname-confirm");
  }
  function lockName() {
    var p = loadProfile();
    p.name = $("#firstnameInput").value.trim() || "Max Mustermann";
    saveProfile(p);
    localStorage.setItem("gtg_onboarded", "1");
    goLoading();
  }

  /* ---------- camera ---------- */
  function startCamera() {
    stopCamera();
    setHint("");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setHint("Camera not available — upload a photo instead."); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: cam.facing } }, audio: false })
      .then(function (stream) {
        cam.stream = stream;
        video.srcObject = stream;
        video.muted = true;
        video.setAttribute("playsinline", "");
        cam.track = stream.getVideoTracks()[0];
        var p = video.play(); if (p && p.catch) p.catch(function () {});
        setHint("");
        // enable the switch button only if a second camera exists
        if (navigator.mediaDevices.enumerateDevices) {
          navigator.mediaDevices.enumerateDevices().then(function (devs) {
            cam.multiple = devs.filter(function (d) { return d.kind === "videoinput"; }).length > 1;
            var sb = $("#btnSwitch"); if (sb) sb.classList.toggle("is-disabled", !cam.multiple);
          }).catch(function () {});
        }
      })
      .catch(function () { setHint("Camera unavailable — use the upload button instead."); });
  }
  function stopCamera() {
    if (cam.stream) { cam.stream.getTracks().forEach(function (t) { t.stop(); }); cam.stream = null; cam.track = null; cam.torch = false; }
    if (video) video.srcObject = null;
    var fb = $("#btnFlash"); if (fb) fb.classList.remove("is-on");
  }
  function setHint(msg) { var h = $("#camHint"); if (h) h.textContent = msg; }
  function setPhoto(url, landscape) { state.photo = url; state.landscape = !!landscape; }
  function capturePhoto() {
    // cannot proceed without a real photo — must capture (live camera) or upload
    if (!cam.stream || !video.videoWidth) { setHint("No camera connected — use the upload button to add your proof."); return; }
    var c = document.createElement("canvas");
    c.width = video.videoWidth; c.height = video.videoHeight;
    var ctx = c.getContext("2d");
    ctx.drawImage(video, 0, 0);                 // no mirror — capture matches the preview
    setPhoto(c.toDataURL("image/jpeg", 0.9), c.width >= c.height);
    goReview();
  }
  function switchCamera() {
    if (cam.multiple === false) return;         // only one camera → the button does nothing
    cam.facing = cam.facing === "environment" ? "user" : "environment";
    startCamera();
  }
  function toggleFlash() {
    if (!cam.track) return;
    cam.track.applyConstraints({ advanced: [{ torch: !cam.torch }] })
      .then(function () { cam.torch = !cam.torch; $("#btnFlash").classList.toggle("is-on", cam.torch); })
      .catch(function () { /* torch unsupported on this device */ });
  }

  /* ---------- flow ---------- */
  function startQuest(idx) { clearSeq(); state.chosen = state.daily[idx]; state.photo = null; $("#camQuest").innerHTML = questCard(state.chosen, null, false); show("camera"); startCamera(); }
  function goReview() { $("#reviewOverview").innerHTML = overview(state.chosen); show("review"); }
  function goCompleted() {
    addToGallery();                   // record the finished quest (photo stored downscaled)
    markDoneToday();                  // lock "Todays Sidequests" until the next day
    // award the EXP now so it counts even if the celebration is skipped; playExp only visualises it
    var cat = state.chosen.category, gain = 10, oldXp = getXp(cat);
    state.expAnim = { cat: cat, gain: gain, oldXp: oldXp, newXp: oldXp + gain };
    setXp(cat, oldXp + gain);
    $("#completedOverview").innerHTML = overview(state.chosen);
    show("completed");
    seqAfter(1800, playExp);          // auto-advance into the level-up sequence
  }

  var MAIN_SHAPE = { outside: "outside", indoor: "indoors", social: "social" };
  function setExpLevel(v) { expShape.style.setProperty("--level", v); }
  function setExpLevelInstant(v) {                 // jump the liquid with no transition (for the reset)
    var liq = expShape.querySelector(".level-shape__liquid");
    liq.style.transition = "none";
    expShape.style.setProperty("--level", v);
    void liq.offsetWidth;
    liq.style.transition = "";
  }
  function swapHeadline(text) {                     // cross-fade the headline text
    if (expHeadline.textContent === text) return;
    expHeadline.classList.add("is-swapping");
    seqAfter(250, function () { expHeadline.textContent = text; expHeadline.classList.remove("is-swapping"); });
  }
  function popLevelNum(n) {                         // bump the level number to show a level-up
    expLevelNum.textContent = n;
    expLevelNum.classList.remove("is-pop"); void expLevelNum.offsetWidth; expLevelNum.classList.add("is-pop");
  }
  function playExp() {
    var a = state.expAnim || { cat: state.chosen.category, gain: 10, oldXp: getXp(state.chosen.category), newXp: getXp(state.chosen.category) };
    var cat = a.cat, gain = a.gain, oldXp = a.oldXp, newXp = a.newXp;
    var oldLevel = levelFromXP(oldXp), newLevel = levelFromXP(newXp);
    var startProg = levelProgress(oldXp), finalProg = levelProgress(newXp);

    expHeadline.textContent = "Well done! You earned " + gain + " " + cat + " EXP.";
    expHeadline.classList.remove("is-swapping");
    expLevelNum.textContent = oldLevel;
    expShape.className = "level-shape level-shape--lg exp__shape cat-" + cat + " shape-" + MAIN_SHAPE[cat];
    setExpLevelInstant(fillDisplay(startProg));
    expFly.src = "assets/svg/shapes/" + state.chosen.shape + "_color.svg";
    expFly.style.animation = "none";

    show("exp");
    requestAnimationFrame(function () { expFly.style.animation = "exp-fly 1.1s cubic-bezier(.45,.05,.55,.95) forwards"; });

    // timing — a deliberate, level-by-level fill (the icon lands as the first fill begins)
    var FIRST = 600, FILL = 1000, HOLD = 520, RESET = 360;
    var levelUps = newLevel - oldLevel;

    if (levelUps <= 0) {                            // no level-up — just top up to the new progress
      seqAfter(FIRST, function () { setExpLevel(fillDisplay(finalProg)); });
      seqAfter(FIRST + FILL + HOLD, goSummary);
      return;
    }

    // first fill: from the old progress up to the top (completes the old level)
    seqAfter(FIRST, function () { setExpLevel("95%"); });
    var t = FIRST + FILL;
    for (var i = 1; i <= levelUps; i++) {
      (function (i, tStart) {
        var lvl = oldLevel + i;
        var isLast = (i === levelUps);
        // on reaching the top: announce the level-up, pop the number, reset the shape to empty
        seqAfter(tStart + HOLD, function () {
          if (i === 1) swapHeadline("Level up!");
          popLevelNum(lvl);
          setExpLevelInstant(fillDisplay(0));
        });
        // then fill from the bottom again — to the top for an in-between level, or to the final progress
        seqAfter(tStart + HOLD + RESET, function () { setExpLevel(isLast ? fillDisplay(finalProg) : "95%"); });
      })(i, t);
      t += HOLD + RESET + FILL;
    }
    seqAfter(t + HOLD, goSummary);
  }
  function goSummary() { $("#summaryOverview").innerHTML = overview(state.chosen, true); show("summary"); }
  /* re-show "All done for today!" when a quest was already completed today (from a stored record) */
  function goDoneSummary() {
    var c = loadCompleted();
    var rec = (c.id && (loadGallery().filter(function (r) { return r.id === c.id; })[0]
      || loadArchive().filter(function (r) { return r.id === c.id; })[0])) || null;
    var src = rec || c.quest;
    $("#summaryOverview").innerHTML = src ? buildOverview({
      color: src.color, shape: src.shape, subLabel: src.subLabel, description: src.description,
      photo: rec ? rec.photo : null, landscape: src.landscape, date: src.date,
      imageDeleted: rec ? rec.imageDeleted : false, check: true
    }) : "";
    show("summary");
  }

  /* ---------- profile ---------- */
  function renderProfile() {
    var p = loadProfile();
    var av = document.querySelector(".screen--profile .profile-card__avatar");
    if (av) av.innerHTML = avatarHTML(p.pic);
    $("#profileName").textContent = p.name || "Max Mustermann";
    $("#profileTitle").textContent = p.title || "Newbie";
    var g = loadGallery();
    // archived quests still count toward the totals (archiving never lowers the count)
    var counted = g.concat(loadArchive());
    $("#profileTotalNum").textContent = counted.length;
    var counts = { outside: 0, indoor: 0, social: 0 };
    counted.forEach(function (r) { if (counts[r.category] != null) counts[r.category]++; });
    $("#cntOutside").textContent = counts.outside;
    $("#cntIndoor").textContent = counts.indoor;
    $("#cntSocial").textContent = counts.social;

    MAIN_CATS.forEach(function (cat) {
      var xp = getXp(cat);
      $("#lvlNum" + cap(cat)).textContent = levelFromXP(xp);
      var shape = document.getElementById("lvl" + cap(cat));
      if (shape) requestAnimationFrame(function () { shape.style.setProperty("--level", fillDisplay(levelProgress(xp))); });
    });

    renderGallery(g);
  }

  function galleryCard(r) {
    var isNew = r.id === state.justCompletedId;
    var inner = r.photo ? '<img src="' + r.photo + '" alt="Proof photo">' : '<span class="gallery-card__shape qs-' + r.shape + '"></span>';
    return '<article class="gallery-card cat-' + r.color + (isNew ? " gallery-card--new" : "") + '" data-id="' + r.id + '" role="button" tabindex="0">'
      + '<div class="gallery-card__photo' + (r.photo ? "" : " gallery-card__photo--shape") + '">' + inner + "</div>"
      + '<p class="gallery-card__desc">' + esc(r.description) + "</p>"
      + "</article>";
  }
  function renderGallery(g) {
    var grid = $("#galleryGrid"), empty = $("#galleryEmpty");
    if (!g.length) { grid.innerHTML = ""; grid.hidden = true; empty.hidden = false; return; }
    empty.hidden = true; grid.hidden = false;
    grid.innerHTML = g.slice().reverse().map(galleryCard).join("");   // newest first
    state.justCompletedId = null;                                     // the pop-in only plays once
    // a quest being archived swipes away, then is removed for good
    if (state.archivingId) {
      var id = state.archivingId; state.archivingId = null;
      var el = grid.querySelector('.gallery-card[data-id="' + id + '"]');
      if (el) {
        el.classList.add("gallery-card--archiving");
        setTimeout(function () { archiveRecord(id); renderProfile(); }, 760);
      } else { archiveRecord(id); renderProfile(); }
    }
  }

  function openDetail(id) {
    var rec = loadGallery().filter(function (r) { return r.id === id; })[0];
    if (!rec) return;
    state.detailId = id;
    $("#detailOverview").innerHTML = buildOverview({
      color: rec.color, shape: rec.shape, subLabel: rec.subLabel, description: rec.description,
      photo: rec.photo, landscape: rec.landscape, date: rec.date, imageDeleted: rec.imageDeleted
    });
    show("detail");
  }

  /* ---------- archive a quest (out of the gallery) ---------- */
  function openArchiveConfirm() { archiveScrim.classList.add("is-open"); }
  function closeArchive() { archiveScrim.classList.remove("is-open"); }
  function confirmArchive() {
    closeArchive();
    state.archivingId = state.detailId;   // the card swipes away once we're back on the profile
    state.detailId = null;
    show("profile");
  }

  /* ---------- save the quest overview as a PNG ---------- */
  function loadImg(src) { return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = src; }); }
  function roundRectPath(ctx, x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function wrapLines(ctx, text, maxW) {
    var words = String(text).split(/\s+/), lines = [], line = "";
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = words[i]; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }
  function exportOverviewPng(rec) {
    var COL = { outside: "#B7DC7D", indoor: "#FFCE6D", social: "#C892F8" };
    var BORDER = "#3B3832", PHOTO_BG = "#D6CFBF";
    var S = 2, W = 380, pad = 16, gap = 16;            /* full-bleed: no card border/margin */
    var innerW = W - pad * 2, shapeSz = 64, headGap = 16;
    var descW = innerW - shapeSz - headGap, lineH = 24;
    var aspect = rec.landscape ? (87 / 86) : (3 / 4);
    var photoW = innerW, photoH = Math.round(photoW / aspect);
    var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();

    return Promise.all([fontsReady, loadImg(rec.photo), loadImg("assets/svg/shapes/" + rec.shape + "_outline.svg").catch(function () { return null; })])
      .then(function (arr) {
        var photoImg = arr[1], shapeImg = arr[2];
        var color = COL[rec.category] || COL.indoor;
        var m = document.createElement("canvas").getContext("2d");
        m.font = '500 18px "Tirra", sans-serif';
        var lines = wrapLines(m, rec.description, descW);
        var descH = lines.length * lineH, headH = Math.max(shapeSz, descH), dateH = 16;
        var padTop = 24, padBottom = 16;
        var H = padTop + headH + gap + photoH + gap + dateH + padBottom;

        var c = document.createElement("canvas");
        c.width = W * S; c.height = H * S;
        var ctx = c.getContext("2d");
        ctx.scale(S, S);

        // the quest colour fills the whole image (no border, no rounded corners)
        ctx.fillStyle = color; ctx.fillRect(0, 0, W, H);

        // head: shape + description
        if (shapeImg) ctx.drawImage(shapeImg, pad, padTop, shapeSz, shapeSz);
        ctx.fillStyle = BORDER; ctx.font = '500 18px "Tirra", sans-serif'; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
        var tx = pad + shapeSz + headGap, ty = padTop + (headH - descH) / 2 + 18;
        lines.forEach(function (ln, i) { ctx.fillText(ln, tx, ty + i * lineH); });

        // photo (kept rounded with a thin border), cover-fit
        var px = pad, py = padTop + headH + gap;
        ctx.save();
        roundRectPath(ctx, px, py, photoW, photoH, 12); ctx.clip();
        ctx.fillStyle = PHOTO_BG; ctx.fillRect(px, py, photoW, photoH);
        var ir = photoImg.naturalWidth / photoImg.naturalHeight, pr = photoW / photoH, dw, dh;
        if (ir > pr) { dh = photoH; dw = dh * ir; } else { dw = photoW; dh = dw / ir; }
        ctx.drawImage(photoImg, px + (photoW - dw) / 2, py + (photoH - dh) / 2, dw, dh);
        ctx.restore();
        ctx.lineWidth = 1; ctx.strokeStyle = BORDER; roundRectPath(ctx, px, py, photoW, photoH, 12); ctx.stroke();

        // subcategory bubble — sits on the photo's top-right, overlapping the edge
        var tag = String(rec.subLabel), tagH = 32;
        ctx.font = '500 12px "Tirra", sans-serif';
        var tagW = Math.max(112, ctx.measureText(tag).width + 32);
        var tagX = px + photoW - tagW, tagY = py - 16;
        ctx.fillStyle = BORDER; roundRectPath(ctx, tagX + 4, tagY + 4, tagW, tagH, 16); ctx.fill();
        ctx.fillStyle = color; roundRectPath(ctx, tagX, tagY, tagW, tagH, 16); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = BORDER; roundRectPath(ctx, tagX, tagY, tagW, tagH, 16); ctx.stroke();
        ctx.fillStyle = BORDER; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(tag, tagX + tagW / 2, tagY + tagH / 2 + 1);

        // date — centred at the bottom
        ctx.font = '500 12px "Tirra", sans-serif'; ctx.fillStyle = BORDER; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
        ctx.fillText(rec.date, W / 2, py + photoH + gap + 12);
        ctx.textAlign = "left";
        return c;
      });
  }
  function saveOverviewPng() {
    var rec = loadGallery().filter(function (r) { return r.id === state.detailId; })[0];
    if (!rec) return;
    exportOverviewPng(rec).then(function (canvas) {
      var fname = "go-touch-grass-" + rec.sub + "-" + rec.date.replace(/\./g, "-") + ".png";
      var trigger = function (url, revoke) {
        var a = document.createElement("a");
        a.href = url; a.download = fname;
        document.body.appendChild(a); a.click(); a.remove();
        if (revoke) setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      };
      if (canvas.toBlob) canvas.toBlob(function (b) { b ? trigger(URL.createObjectURL(b), true) : trigger(canvas.toDataURL("image/png"), false); }, "image/png");
      else trigger(canvas.toDataURL("image/png"), false);
    }).catch(function () {});
  }

  /* ===================================================================
     SETTINGS
     =================================================================== */
  var BACK = {
    detail: "profile", settings: "profile",
    "set-profile": "settings", "set-pfp": "set-profile", "set-title": "set-profile",
    "set-language": "settings", "set-blocked": "settings",
    "set-archived": "settings", "set-archived-detail": "set-archived", "set-permissions": "settings",
    "set-crop": "set-pfp", "set-debug": "settings"
  };
  function goBack() { show(BACK[state.screen] || "profile"); }

  /* preferences (push / sounds — no effect yet) */
  function renderPrefs() {
    var pr = loadPrefs();
    var sp = $("#swPush"); if (sp) sp.setAttribute("aria-checked", pr.push ? "true" : "false");
    var ss = $("#swSounds"); if (ss) ss.setAttribute("aria-checked", pr.sounds ? "true" : "false");
  }
  function togglePref(key, sw) {
    var on = sw.getAttribute("aria-checked") === "true";
    sw.setAttribute("aria-checked", on ? "false" : "true");
    var pr = loadPrefs(); pr[key] = !on; savePrefs(pr);
  }

  /* ---- Profile ---- */
  function renderSetProfile() {
    var p = loadProfile(), name = p.name || "Max Mustermann";
    $("#setProfileAvatar").innerHTML = avatarHTML(p.pic);
    $("#nameValue").textContent = name;
    $("#nameInput").value = name;
    $("#titleValue").textContent = p.title || "Newbie";
    $("#nameCard").classList.remove("is-editing");
  }
  function startNameEdit() { $("#nameCard").classList.add("is-editing"); var i = $("#nameInput"); i.focus(); i.select(); }
  function saveProfileForm() {
    var p = loadProfile();
    p.name = $("#nameInput").value.trim() || "Max Mustermann";
    saveProfile(p);
    $("#nameValue").textContent = p.name;
    $("#nameCard").classList.remove("is-editing");
  }

  /* ---- Profile picture ---- */
  function renderPfp() {
    $("#pfpAvatar").innerHTML = avatarHTML(state.pendingPic);
    document.querySelectorAll("#pfpGrid .pfp").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-pic") === state.pendingPic ? "true" : "false");
    });
  }
  function setPendingPic(pic) { state.pendingPic = pic; renderPfp(); }
  function savePfp() { var p = loadProfile(); p.pic = state.pendingPic || ""; saveProfile(p); goBack(); }
  /* uploaded/taken picture → crop screen (pan + zoom into a square) */
  function openCrop(file) {
    if (!file) return;
    var fr = new FileReader();
    fr.onload = function () {
      var img = $("#cropImg");
      img.onload = function () { crop.natW = img.naturalWidth; crop.natH = img.naturalHeight; show("set-crop"); initCrop(); };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }
  function initCrop() {
    crop.b = $("#cropBox").clientWidth || 300;
    crop.cover = crop.b / Math.min(crop.natW, crop.natH);   // smaller edge fills the box at zoom 1
    crop.s = 1; crop.x = 0; crop.y = 0;
    $("#cropZoom").value = 1;
    renderCrop();
  }
  function renderCrop() {
    var img = $("#cropImg");
    var dispW = crop.natW * crop.cover * crop.s, dispH = crop.natH * crop.cover * crop.s;
    img.style.width = dispW + "px"; img.style.height = dispH + "px";
    var maxX = Math.max(0, (dispW - crop.b) / 2), maxY = Math.max(0, (dispH - crop.b) / 2);
    crop.x = Math.max(-maxX, Math.min(maxX, crop.x));   // keep the image covering the box
    crop.y = Math.max(-maxY, Math.min(maxY, crop.y));
    img.style.transform = "translate(-50%,-50%) translate(" + crop.x + "px," + crop.y + "px)";
  }
  function saveCrop() {
    var OUT = 320, f = crop.cover * crop.s;             // displayed px per natural px
    var dispW = crop.natW * f, dispH = crop.natH * f;
    var srcX = (dispW / 2 - crop.b / 2 - crop.x) / f;   // visible square → source rect (natural px)
    var srcY = (dispH / 2 - crop.b / 2 - crop.y) / f;
    var srcSize = crop.b / f;
    var c = document.createElement("canvas"); c.width = OUT; c.height = OUT;
    c.getContext("2d").drawImage($("#cropImg"), srcX, srcY, srcSize, srcSize, 0, 0, OUT, OUT);
    state.pendingPic = c.toDataURL("image/jpeg", 0.85);
    show("set-pfp");
  }

  /* ---- Title ---- */
  function renderTitle() {
    var t = loadProfile().title || "";
    document.querySelectorAll("#titleList .list-btn--select").forEach(function (b) {
      b.querySelector(".radio").setAttribute("aria-checked", b.getAttribute("data-title") === t ? "true" : "false");
    });
  }
  function selectTitle(title) { var p = loadProfile(); p.title = title; saveProfile(p); renderTitle(); }

  /* ---- Blocked sidequests ---- */
  function blockedCard(rec, idx) {
    return '<article class="quest-card cat-' + rec.color + ' qs-' + rec.shape + (state.blockedSel.has(idx) ? " is-selected" : "") + '" data-bidx="' + idx + '" role="button" tabindex="0">'
      + '<span class="quest-card__tag">' + esc(rec.subLabel) + "</span>"
      + '<span class="quest-card__shape"></span>'
      + '<p class="quest-card__desc">' + esc(rec.description) + "</p></article>";
  }
  function renderBlocked() {
    var b = loadBlocked();
    $("#blockedCount").textContent = "You have blocked " + b.length + "/" + MAX_BLOCKED + " Sidequests";
    $("#blockedList").innerHTML = b.map(blockedCard).join("");
    $("#blockedEmpty").hidden = b.length > 0;
    setBlockedSelecting(false);
  }
  function setBlockedSelecting(on) {
    state.selectingBlocked = on;
    state.blockedSel.clear();
    screens["set-blocked"].classList.toggle("is-selecting", on);
    $("#btnBlockedEdit").hidden = on;
    $("#btnBlockedDone").hidden = !on;
    $("#blockedCount").hidden = on;
    $("#btnSelectAll").hidden = !on;
    document.querySelectorAll("#blockedList .quest-card.is-selected").forEach(function (c) { c.classList.remove("is-selected"); });
  }
  function toggleBlockedCard(card) {
    var idx = +card.getAttribute("data-bidx");
    if (state.blockedSel.has(idx)) { state.blockedSel.delete(idx); card.classList.remove("is-selected"); }
    else { state.blockedSel.add(idx); card.classList.add("is-selected"); }
  }
  function selectAllBlocked() {
    document.querySelectorAll("#blockedList .quest-card").forEach(function (c) {
      state.blockedSel.add(+c.getAttribute("data-bidx")); c.classList.add("is-selected");
    });
  }
  function confirmUnblock() {
    var b = loadBlocked(), removed = [];
    var kept = b.filter(function (r, i) { if (state.blockedSel.has(i)) { removed.push(r); return false; } return true; });
    saveBlocked(kept);
    // re-enable any of today's sidequests that match an unblocked record (un-greys them)
    removed.forEach(function (rec) {
      state.daily.forEach(function (q) {
        if (q.blocked && q.category === rec.category && q.sub === rec.sub && q.description === rec.description) q.blocked = false;
      });
    });
    saveDaily(state.daily);
    unblockScrim.classList.remove("is-open");
    renderBlocked();
  }

  /* ---- Archived sidequests ---- */
  function renderArchived() {
    var a = loadArchive(), grid = $("#archivedGrid"), empty = $("#archivedEmpty");
    if (!a.length) { grid.innerHTML = ""; grid.hidden = true; empty.hidden = false; return; }
    empty.hidden = true; grid.hidden = false;
    grid.innerHTML = a.slice().reverse().map(galleryCard).join("");   // newest first
  }
  function openArchivedDetail(id) {
    var rec = loadArchive().filter(function (r) { return r.id === id; })[0];
    if (!rec) return;
    state.archivedId = id;
    $("#archivedOverview").innerHTML = buildOverview({
      color: rec.color, shape: rec.shape, subLabel: rec.subLabel, description: rec.description,
      photo: rec.photo, landscape: rec.landscape, date: rec.date, imageDeleted: rec.imageDeleted
    });
    $("#btnDelImage").classList.toggle("is-inert", !!rec.imageDeleted);   // already deleted: keep its normal look but make it do nothing
    show("set-archived-detail");
  }
  function confirmDeleteImage() {
    var a = loadArchive();
    a.forEach(function (r) { if (r.id === state.archivedId) { r.photo = null; r.imageDeleted = true; } });
    saveArchive(a);
    deleteImageScrim.classList.remove("is-open");
    openArchivedDetail(state.archivedId);   // re-render → shows "image has been deleted"
  }
  function restoreArchived() {
    var rec = null, rest = [];
    loadArchive().forEach(function (r) { if (r.id === state.archivedId && !rec) rec = r; else rest.push(r); });
    if (rec) { var g = loadGallery(); g.push(rec); saveGallery(g); saveArchive(rest); }
    state.archivedId = null;
    show("set-archived");
  }

  /* ---- Permissions ---- */
  function renderPermissions() {
    var perms = loadPerms();
    document.querySelectorAll(".switch[data-perm]").forEach(function (sw) {
      sw.setAttribute("aria-checked", perms[sw.getAttribute("data-perm")] ? "true" : "false");
    });
  }
  function savePermsFromSwitches() {
    var perms = {};
    document.querySelectorAll(".switch[data-perm]").forEach(function (sw) {
      perms[sw.getAttribute("data-perm")] = sw.getAttribute("aria-checked") === "true";
    });
    savePerms(perms);
  }
  function onPermSwitch(sw) {
    if (sw.getAttribute("aria-checked") === "true") { sw.setAttribute("aria-checked", "false"); savePermsFromSwitches(); }
    else { sw.setAttribute("aria-checked", "true"); state.pendingPermSw = sw; permsScrim.classList.add("is-open"); }
  }
  function cancelPerm() {
    if (state.pendingPermSw) { state.pendingPermSw.setAttribute("aria-checked", "false"); state.pendingPermSw = null; }
    savePermsFromSwitches();
    permsScrim.classList.remove("is-open");
  }

  /* ---------- debug (hidden behind Terms of Service) ---------- */
  function resetApp() {                              // wipe all app data → restart from the first-time onboarding
    Object.keys(localStorage).filter(function (k) { return k.indexOf("gtg_") === 0; }).forEach(function (k) { localStorage.removeItem(k); });
    location.reload();
  }
  function debugSkipDone() {                         // bypass the daily lock and jump straight to Todays Sidequests
    localStorage.removeItem("gtg_completed");
    clearSeq();
    show("sidequests");
  }

  /* ---------- blocking ---------- */
  function setBlocking(on) {
    state.blocking = on;
    screens.sidequests.classList.toggle("is-blocking", on);
    $("#headNormal").hidden = on;
    $("#headBlocking").hidden = !on;
    if (!on) {
      state.selected.clear();
      document.querySelectorAll("#questList .quest-card.is-selected").forEach(function (c) { c.classList.remove("is-selected"); });
    }
  }
  function openBlockConfirm() {
    if (state.selected.size === 0) { setBlocking(false); return; }   // nothing chosen → just leave blocking
    $("#popupTitle").textContent = state.selected.size === 1
      ? "You're about to block this sidequest"
      : "You're about to block these sidequests";
    scrim.classList.add("is-open");
  }
  function closePopup() { scrim.classList.remove("is-open"); }
  function confirmBlock() {
    state.selected.forEach(function (idx) { state.daily[idx].blocked = true; addBlocked(state.daily[idx]); });
    saveDaily(state.daily);
    state.selected.clear();
    closePopup();
    setBlocking(false);
    show("sidequests");          // land back on Todays Sidequests
  }

  /* ---------- events ---------- */
  function onCardActivate(e) {
    var card = e.target.closest(".quest-card"); if (!card) return;
    if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    var idx = +card.getAttribute("data-idx");
    if (isNaN(idx) || state.daily[idx].blocked) return;
    if (state.blocking) {
      if (state.selected.has(idx)) { state.selected.delete(idx); card.classList.remove("is-selected"); }
      else { state.selected.add(idx); card.classList.add("is-selected"); }
    } else {
      startQuest(idx);
    }
  }

  function bind() {
    var list = $("#questList");
    list.addEventListener("click", onCardActivate);
    list.addEventListener("keydown", onCardActivate);

    $("#btnBlock").addEventListener("click", function () { setBlocking(true); });
    $("#btnBlockDone").addEventListener("click", openBlockConfirm);
    $("#btnBlockBack").addEventListener("click", function () { setBlocking(false); });
    $("#btnCancel").addEventListener("click", closePopup);
    $("#btnOk").addEventListener("click", confirmBlock);
    scrim.addEventListener("click", function (e) { if (e.target === scrim) closePopup(); });

    $("#btnCamBack").addEventListener("click", function () { show("sidequests"); });
    $("#btnShutter").addEventListener("click", capturePhoto);
    $("#btnSwitch").addEventListener("click", switchCamera);
    $("#btnFlash").addEventListener("click", toggleFlash);
    $("#btnUpload").addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function () {
      var f = this.files && this.files[0]; if (!f) return;
      var url = URL.createObjectURL(f), img = new Image();
      img.onload = function () { setPhoto(url, img.naturalWidth >= img.naturalHeight); goReview(); };
      img.src = url;
      this.value = "";
    });

    $("#btnReviewBack").addEventListener("click", function () { show("camera"); startCamera(); });
    $("#btnRedo").addEventListener("click", function () { show("camera"); startCamera(); });
    $("#btnFinish").addEventListener("click", goCompleted);

    // first-time onboarding: name entry + confirm
    $("#btnNameConfirm").addEventListener("click", confirmName);
    $("#firstnameInput").addEventListener("keydown", function (e) { if (e.key === "Enter") confirmName(); });
    $("#btnNameRetry").addEventListener("click", function () { show("firstname"); setTimeout(function () { $("#firstnameInput").focus(); }, 60); });
    $("#btnNameYes").addEventListener("click", lockName);

    // profile card: tap "Total Quests" to expand the per-category breakdown
    var totals = $("#profileTotals");
    function toggleTotals() {
      var open = $("#profileCard").classList.toggle("is-open");
      totals.setAttribute("aria-expanded", open ? "true" : "false");
    }
    totals.addEventListener("click", toggleTotals);
    totals.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleTotals(); } });

    // gallery: tap a card → open its overview detail
    var grid = $("#galleryGrid");
    function onGalleryActivate(e) {
      var card = e.target.closest(".gallery-card"); if (!card) return;
      if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      openDetail(card.getAttribute("data-id"));
    }
    grid.addEventListener("click", onGalleryActivate);
    grid.addEventListener("keydown", onGalleryActivate);

    // quest-overview detail: back / archive / save to device
    $("#btnDetailBack").addEventListener("click", function () { show("profile"); });
    $("#btnDetailArchive").addEventListener("click", openArchiveConfirm);
    $("#btnDetailSave").addEventListener("click", saveOverviewPng);
    $("#btnArchiveCancel").addEventListener("click", closeArchive);
    $("#btnArchiveConfirm").addEventListener("click", confirmArchive);
    archiveScrim.addEventListener("click", function (e) { if (e.target === archiveScrim) closeArchive(); });

    // burger → settings
    $("#btnBurger").addEventListener("click", function () { show("settings"); });

    // settings navigation — [data-go] drills in, [data-back] steps back
    document.addEventListener("click", function (e) {
      var go = e.target.closest("[data-go]");
      if (go) { e.preventDefault(); show(go.getAttribute("data-go")); return; }
      var back = e.target.closest("[data-back]");
      if (back) { e.preventDefault(); goBack(); }
    });

    // preferences + permission switches
    $("#swPush").addEventListener("click", function () { togglePref("push", this); });
    $("#swSounds").addEventListener("click", function () { togglePref("sounds", this); });
    document.querySelectorAll(".switch[data-perm]").forEach(function (sw) { sw.addEventListener("click", function () { onPermSwitch(sw); }); });
    $("#btnPermsOk").addEventListener("click", function () { state.pendingPermSw = null; savePermsFromSwitches(); permsScrim.classList.remove("is-open"); });
    $("#btnPermsCancel").addEventListener("click", cancelPerm);
    permsScrim.addEventListener("click", function (e) { if (e.target === permsScrim) cancelPerm(); });

    // profile settings: name edit toggles to a save button
    $("#btnEditName").addEventListener("click", startNameEdit);
    $("#btnSaveName").addEventListener("click", saveProfileForm);
    $("#nameInput").addEventListener("keydown", function (e) { if (e.key === "Enter") saveProfileForm(); });

    // profile picture: open the editor seeded with the current pic, pick svg / upload / take / save
    $("#btnEditPic").addEventListener("click", function () { state.pendingPic = loadProfile().pic || ""; show("set-pfp"); });
    $("#pfpGrid").addEventListener("click", function (e) { var b = e.target.closest(".pfp"); if (b) setPendingPic(b.getAttribute("data-pic")); });
    $("#btnUploadPic").addEventListener("click", function () { $("#pfpUploadInput").click(); });
    $("#btnTakePic").addEventListener("click", function () { $("#pfpCameraInput").click(); });
    function onPicFile() { var f = this.files && this.files[0]; if (f) openCrop(f); this.value = ""; }
    $("#pfpUploadInput").addEventListener("change", onPicFile);
    $("#pfpCameraInput").addEventListener("change", onPicFile);
    $("#btnPfpSave").addEventListener("click", savePfp);

    // crop screen: drag to pan, slider to zoom, save to apply
    var cropBox = $("#cropBox");
    cropBox.addEventListener("pointerdown", function (e) { crop.dragging = true; crop.sx = e.clientX; crop.sy = e.clientY; crop.spx = crop.x; crop.spy = crop.y; if (cropBox.setPointerCapture) { try { cropBox.setPointerCapture(e.pointerId); } catch (err) {} } });
    cropBox.addEventListener("pointermove", function (e) { if (!crop.dragging) return; crop.x = crop.spx + (e.clientX - crop.sx); crop.y = crop.spy + (e.clientY - crop.sy); renderCrop(); });
    cropBox.addEventListener("pointerup", function () { crop.dragging = false; });
    cropBox.addEventListener("pointercancel", function () { crop.dragging = false; });
    $("#cropZoom").addEventListener("input", function () { crop.s = parseFloat(this.value); renderCrop(); });
    $("#btnCropSave").addEventListener("click", saveCrop);

    // title
    $("#titleList").addEventListener("click", function (e) { var b = e.target.closest(".list-btn--select"); if (b) selectTitle(b.getAttribute("data-title")); });

    // blocked sidequests
    $("#btnBlockedEdit").addEventListener("click", function () { setBlockedSelecting(true); });
    $("#btnBlockedBack").addEventListener("click", function () { if (state.selectingBlocked) setBlockedSelecting(false); else goBack(); });
    $("#btnSelectAll").addEventListener("click", selectAllBlocked);
    $("#btnBlockedDone").addEventListener("click", function () { if (state.blockedSel.size > 0) unblockScrim.classList.add("is-open"); else setBlockedSelecting(false); });
    $("#blockedList").addEventListener("click", function (e) { if (!state.selectingBlocked) return; var c = e.target.closest(".quest-card"); if (c) toggleBlockedCard(c); });
    $("#btnUnblockCancel").addEventListener("click", function () { unblockScrim.classList.remove("is-open"); });
    $("#btnUnblockOk").addEventListener("click", confirmUnblock);
    unblockScrim.addEventListener("click", function (e) { if (e.target === unblockScrim) unblockScrim.classList.remove("is-open"); });

    // archived sidequests
    $("#archivedGrid").addEventListener("click", function (e) { var c = e.target.closest(".gallery-card"); if (c) openArchivedDetail(c.getAttribute("data-id")); });
    $("#archivedGrid").addEventListener("keydown", function (e) { if (e.key !== "Enter" && e.key !== " ") return; var c = e.target.closest(".gallery-card"); if (c) { e.preventDefault(); openArchivedDetail(c.getAttribute("data-id")); } });
    $("#btnDelImage").addEventListener("click", function () { if (this.classList.contains("is-inert")) return; deleteImageScrim.classList.add("is-open"); });
    $("#btnRestore").addEventListener("click", restoreArchived);
    $("#btnDelImgCancel").addEventListener("click", function () { deleteImageScrim.classList.remove("is-open"); });
    $("#btnDelImgConfirm").addEventListener("click", confirmDeleteImage);
    deleteImageScrim.addEventListener("click", function (e) { if (e.target === deleteImageScrim) deleteImageScrim.classList.remove("is-open"); });

    // debug screen (behind Terms of Service): reset everything / bypass the daily lock
    $("#btnDbgReset").addEventListener("click", resetApp);
    $("#btnDbgSkip").addEventListener("click", debugSkipDone);

    // bottom bar: switch sections (with the icon pop)
    function popTab(t) { t.classList.remove("is-popping"); void t.offsetWidth; t.classList.add("is-popping"); }
    document.querySelectorAll(".bottom-bar__tab--quests").forEach(function (t) {
      t.addEventListener("click", function () { clearSeq(); if (state.blocking) setBlocking(false); popTab(t); if (isDoneToday()) goDoneSummary(); else show("sidequests"); });
    });
    document.querySelectorAll(".bottom-bar__tab--profile").forEach(function (t) {
      t.addEventListener("click", function () { clearSeq(); if (state.blocking) setBlocking(false); popTab(t); show("profile"); });
    });
  }

  function init() {
    ["loading", "welcome", "firstname", "firstname-confirm", "sidequests", "camera", "review", "completed", "exp", "summary", "profile", "detail",
     "settings", "set-profile", "set-pfp", "set-crop", "set-title", "set-language", "set-blocked", "set-archived", "set-archived-detail", "set-permissions", "set-debug"
    ].forEach(function (n) { screens[n] = $('[data-screen="' + n + '"]'); });
    video = $("#camVideo");
    fileInput = $("#fileInput");
    scrim = $("#blockScrim");
    archiveScrim = $("#archiveScrim");
    unblockScrim = $("#unblockScrim");
    deleteImageScrim = $("#deleteImageScrim");
    permsScrim = $("#permsScrim");
    expHeadline = $("#expHeadline"); expFly = $("#expFly"); expShape = $("#expShape"); expLevelNum = $("#expLevelNum");

    state.daily = loadDaily();
    preloadShapes();
    bind();
    if (!localStorage.getItem("gtg_onboarded")) playWelcome();   // first launch → welcome → name → confirm
    else if (isDoneToday()) goDoneSummary();                     // already finished today → "All done for today!" (no Todays Sidequests until tomorrow)
    else goLoading();                                            // returning → straight to the shuffle
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
