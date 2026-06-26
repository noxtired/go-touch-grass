/* ============================================================
   Go Touch Grass — component interactions
   Progressive enhancement: wires behaviour by class / data-attr.
   Safe to include on any screen.
   ============================================================ */
(function () {
  "use strict";

  /* ---- Radio buttons (single-select within [data-radio-group]) ---- */
  document.querySelectorAll("[data-radio-group]").forEach(function (group) {
    group.querySelectorAll(".radio").forEach(function (radio) {
      radio.setAttribute("role", "radio");
      radio.addEventListener("click", function () {
        group.querySelectorAll(".radio").forEach(function (r) {
          r.setAttribute("aria-checked", r === radio ? "true" : "false");
        });
      });
    });
  });

  /* ---- Switches (toggle) ---- */
  document.querySelectorAll(".switch").forEach(function (sw) {
    sw.setAttribute("role", "switch");
    if (!sw.hasAttribute("aria-checked")) sw.setAttribute("aria-checked", "false");
    sw.addEventListener("click", function () {
      sw.setAttribute("aria-checked", sw.getAttribute("aria-checked") === "true" ? "false" : "true");
    });
  });

  /* ---- Profile-picture selector (single-select, toggleable) ---- */
  document.querySelectorAll("[data-pfp-group]").forEach(function (group) {
    group.querySelectorAll(".pfp").forEach(function (pfp) {
      if (!pfp.hasAttribute("aria-pressed")) pfp.setAttribute("aria-pressed", "false");
      pfp.addEventListener("click", function () {
        var wasOn = pfp.getAttribute("aria-pressed") === "true";
        group.querySelectorAll(".pfp").forEach(function (p) { p.setAttribute("aria-pressed", "false"); });
        pfp.setAttribute("aria-pressed", wasOn ? "false" : "true");
      });
    });
  });

  /* ---- Password visibility toggle ----
     Masked state shows "*" characters (mono). Field is a text input
     so the stars render literally; the real value lives in data-real. */
  document.querySelectorAll("[data-visibility-toggle]").forEach(function (btn) {
    var card = btn.closest("[data-visibility]") || document;
    var field = card.querySelector(".field, input");
    var icons = btn.querySelectorAll("img[data-on][data-off]");
    if (!field) return;
    if (field.dataset.real == null) field.dataset.real = field.value || "";
    var visible = false;
    function render() {
      field.value = visible ? field.dataset.real : "*".repeat(field.dataset.real.length);
      field.classList.toggle("is-masked", !visible);
      field.readOnly = !visible;
      icons.forEach(function (img) {
        img.src = visible ? img.getAttribute("data-on") : img.getAttribute("data-off");
      });
    }
    field.addEventListener("input", function () { if (visible) field.dataset.real = field.value; });
    btn.addEventListener("click", function () { visible = !visible; render(); });
    render();
  });

  /* ---- Collapsible profile card ---- */
  document.querySelectorAll(".profile-card__totals").forEach(function (toggle) {
    toggle.addEventListener("click", function () {
      var card = toggle.closest(".profile-card");
      if (card) card.classList.toggle("is-open");
    });
  });

  /* ---- Bottom bar tab switch (with icon pop) ---- */
  document.querySelectorAll(".bottom-bar").forEach(function (bar) {
    bar.querySelectorAll(".bottom-bar__tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        bar.setAttribute("data-active", tab.classList.contains("bottom-bar__tab--profile") ? "profile" : "quests");
        tab.classList.remove("is-popping");
        void tab.offsetWidth;            // restart animation
        tab.classList.add("is-popping");
        setTimeout(function () { tab.classList.remove("is-popping"); }, 460);
      });
    });
  });

  /* ---- Loading shapes: cycle each category slot through its variants ---- */
  var CAT_SHAPES = {
    outside: ["action", "discovery", "outside", "scavenger_hunt"],
    indoor:  ["creative", "indoors", "selfcare", "tasks"],
    social:  ["activity", "encounter", "game", "social"]
  };
  document.querySelectorAll(".loading-shapes").forEach(function (group) {
    group.querySelectorAll(".loading-shape").forEach(function (slot, idx) {
      var list = CAT_SHAPES[slot.getAttribute("data-cat")] || [];
      var img = slot.querySelector("img");
      if (!list.length || !img) return;
      var i = 0;
      function swap() {
        i = (i + 1) % list.length;
        img.src = "assets/svg/shapes/" + list[i] + "_color.svg";
        img.style.animation = "none"; void img.offsetWidth; img.style.animation = "";
      }
      setTimeout(function () { setInterval(swap, 600); }, idx * 140);
    });
  });

  /* ---- Level shapes: animate to their target --level on load ---- */
  window.requestAnimationFrame(function () {
    document.querySelectorAll(".level-shape[data-level]").forEach(function (el) {
      // start at 0, then fill to target so the liquid animates up
      el.style.setProperty("--level", "0%");
      window.requestAnimationFrame(function () {
        el.style.setProperty("--level", el.getAttribute("data-level"));
      });
    });
  });
})();
