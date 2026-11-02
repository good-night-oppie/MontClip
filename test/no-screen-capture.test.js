/* Privacy (VV/Deja, 2026-11-02): the drop-reveal and zh-terms smokes saved a "screen" capture of the
   window's area of the desktop, which took in whatever else was on screen there (a Windows Security
   firewall prompt, the taskbar). Smokes and runners capture only the app's own page,
   with webContents.capturePage(). Nothing that starts the app or drives it may take the screen. */
"use strict";
const test = require("node:test"), a = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { ROOT } = require("./helpers");

// screen or desktop capture: Electron's desktopCapturer and screen-share APIs, .NET / Win32 screen copies,
// and the usual command-line screenshot tools
const SCREEN = /desktopCapturer|getDisplayMedia|getSources\s*\(|CopyFromScreen|BitBlt|PrintWindow|GetDC\s*\(\s*(0|IntPtr\.Zero|null)?\s*\)|Graphics\]?::FromHwnd|dipToScreenRect|\.screen\.png|screenshot-desktop|nircmd|screencapture\b|import\s+-window\s+root|gnome-screenshot|scrot\b/i;

function scripts() {
  const out = [];
  for (const [dir, re] of [["desktop", /\.(c?js)$/], ["real-tests", /\.(c?js)$/]]) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) if (re.test(f)) out.push(dir + "/" + f);
  }
  return out;
}

test("no smoke, runner or desktop script captures the screen; only the app's own page", () => {
  const files = scripts();
  a.ok(files.includes("desktop/drop-reveal-smoke.cjs") && files.includes("desktop/zh-terms-smoke.cjs"), "the scan sees the smokes");
  const found = [];
  for (const f of files) {
    const lines = fs.readFileSync(path.join(ROOT, f), "utf8").split(/\r?\n/);
    lines.forEach((l, i) => { const m = l.match(SCREEN); if (m) found.push(`${f}:${i + 1}: ${m[0]}`); });
  }
  a.deepEqual(found, []);
});

test("the smokes that keep screenshots take them with webContents.capturePage", () => {
  for (const f of ["desktop/drop-reveal-smoke.cjs", "desktop/zh-terms-smoke.cjs"]) {
    const s = fs.readFileSync(path.join(ROOT, f), "utf8");
    a.match(s, /webContents\.capturePage\(\)/, f);
  }
});

test("the scan catches the patterns it is meant to", () => {
  for (const bad of ["require('electron').desktopCapturer", "$g.CopyFromScreen($b.X,$b.Y,0,0,$s)", "electron.screen.dipToScreenRect(win,r)",
    "navigator.mediaDevices.getDisplayMedia()", "fs.writeFileSync(name+'.screen.png',x)", "[System.Drawing.Graphics]::FromHwnd(0)"])
    a.ok(SCREEN.test(bad), bad);
  for (const ok of ["(await win.webContents.capturePage()).toPNG()", "name+'.page.png'", "screen.getPrimaryDisplay()"]) a.ok(!SCREEN.test(ok), ok);
});

// Deja (2026-11-02): screen captures are no longer kept in the repository; validation goes by the .page.png.
test("no screen capture is kept under docs/validation", () => {
  const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(d + "/" + e.name) : [d + "/" + e.name]);
  a.deepEqual(walk("docs/validation").filter((f) => /\.screen\.png$/i.test(f)), []);
});

// ...and the two smokes that took them no longer take over the desktop: no window on screen, no focus.
test("drop-reveal and zh-terms smokes run in a hidden, offscreen window: no show, no always-on-top, no focus", () => {
  for (const f of ["desktop/drop-reveal-smoke.cjs", "desktop/zh-terms-smoke.cjs"]) {
    const s = fs.readFileSync(path.join(ROOT, f), "utf8");
    a.doesNotMatch(s, /\.show\(\)|showInactive\(|setAlwaysOnTop|\.focus\(\)|moveTop\(/, f);
    a.match(s, /show:\s*false/, f + " creates its window hidden");
    a.match(s, /offscreen:\s*true/, f + " paints offscreen, so capturePage still gets real frames");
  }
});

// VV (2026-11-02): REVEAL_COMPLETE said "visible":false, which reads like "the clip is not visible". It is the
// window's visibility (false now that the window is offscreen), so it is called windowVisible.
test("drop-reveal reports the window's visibility as windowVisible, not a bare visible", () => {
  const s = fs.readFileSync(path.join(ROOT, "desktop/drop-reveal-smoke.cjs"), "utf8");
  a.match(s, /log\('REVEAL_COMPLETE',\{saved:[^}]*windowVisible:win\.isVisible\(\)\}\)/);
  a.doesNotMatch(s, /[{,]visible:win\.isVisible\(\)/);
});
