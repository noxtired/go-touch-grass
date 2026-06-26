# ============================================================
# Go Touch Grass — minimal static dev server (no Node/Python needed)
# Serves the code/ folder over http://localhost:<port>/
# localhost is a secure context, so getUserMedia (camera) works.
# ============================================================
param(
  [int]$Port = 8123,
  [string]$Root = $PSScriptRoot
)

$ErrorActionPreference = "Stop"

$mime = @{
  ".html"="text/html; charset=utf-8"; ".css"="text/css; charset=utf-8";
  ".js"="text/javascript; charset=utf-8"; ".mjs"="text/javascript; charset=utf-8";
  ".json"="application/json; charset=utf-8"; ".svg"="image/svg+xml";
  ".ttf"="font/ttf"; ".otf"="font/otf"; ".woff"="font/woff"; ".woff2"="font/woff2";
  ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".gif"="image/gif";
  ".webp"="image/webp"; ".ico"="image/x-icon"; ".txt"="text/plain; charset=utf-8";
}

$rootFull = [IO.Path]::GetFullPath($Root)
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Go Touch Grass dev server: http://localhost:$Port/  (root: $rootFull)"

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $req = $context.Request
    $res = $context.Response
    try {
      $path = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
      if ([string]::IsNullOrEmpty($path) -or $path -eq "/") { $path = "/index.html" }
      $rel = $path.TrimStart("/").Replace("/", [IO.Path]::DirectorySeparatorChar)
      $full = [IO.Path]::GetFullPath((Join-Path $rootFull $rel))

      if (-not $full.StartsWith($rootFull)) {
        $res.StatusCode = 403
      } elseif (Test-Path $full -PathType Leaf) {
        $ext = [IO.Path]::GetExtension($full).ToLower()
        $ct = $mime[$ext]; if (-not $ct) { $ct = "application/octet-stream" }
        $bytes = [IO.File]::ReadAllBytes($full)
        $res.ContentType = $ct
        $res.AddHeader("Cache-Control", "no-store")
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $res.StatusCode = 404
        $msg = [Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
        $res.OutputStream.Write($msg, 0, $msg.Length)
      }
    } catch {
      try { $res.StatusCode = 500 } catch {}
    } finally {
      $res.OutputStream.Close()
    }
  }
} finally {
  $listener.Stop()
}
