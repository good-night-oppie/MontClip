/* The side panel inside Cindy (framed by the plugin's panel.html; same origin as the editor). 文稿 lists the timeline's
   lines and follows the playhead; a click moves the editor there. 属性 shows the selected clip. The editor tab talks to
   this page over BroadcastChannel("montclip-editor") (app.js startHostChannel); with no editor tab heard from, a click
   falls back to POST /api/ui/command, which answers NO_EDITOR when none is open. */
(function () {
  "use strict";
  const M = window.MontClipPanelModel;
  const $ = (id) => document.getElementById(id);
  const ch = typeof BroadcastChannel === "function" ? new BroadcastChannel("montclip-editor") : null;
  let project = { clips: [], media: [] }, list = [], editor = null, editorSeen = 0, now = -1;

  /* tabs: arrow keys move between them, as a tablist should */
  const tabs = [$("tabLines"), $("tabProps")], pages = [$("pageLines"), $("pageProps")];
  function pick(i) {
    tabs.forEach((t, j) => { t.setAttribute("aria-selected", String(i === j)); t.tabIndex = i === j ? 0 : -1; pages[j].hidden = i !== j; });
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => pick(i));
    t.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const j = (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
      pick(j); tabs[j].focus();
    });
  });

  function renderLines() {
    list = M.lines(project);
    const ol = $("lines");
    ol.textContent = "";
    for (const [i, l] of list.entries()) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.i = String(i);
      const time = document.createElement("time");
      time.textContent = M.formatTime(l.start);
      const span = document.createElement("span");
      span.textContent = l.text;
      b.append(time, span);
      b.addEventListener("click", () => seek(l.start));
      li.appendChild(b);
      ol.appendChild(li);
    }
    $("linesEmpty").hidden = list.length > 0;
    now = -1;
    follow();
  }
  function follow() {
    const i = editor ? M.currentIndex(list, editor.time) : -1;
    if (i === now) return;
    const items = $("lines").children;
    if (items[now]) items[now].classList.remove("now");
    now = i;
    if (items[i]) {
      items[i].classList.add("now");
      if (editor && editor.playing) items[i].scrollIntoView({ block: "nearest" });
    }
  }
  function renderProps() {
    const f = editor && editor.selId ? M.clipFacts(project, editor.selId) : null;
    const dl = $("props");
    dl.textContent = "";
    $("propsEmpty").hidden = !!f;
    if (!f) return;
    const rows = [["名称", f.name], ["类型", f.kindLabel], ["轨道", f.track], ["开始", M.formatTime(f.start)], ["结束", M.formatTime(f.end)],
      ["时长", f.duration + " 秒"]];
    if (f.in !== null) rows.push(["素材起点", M.formatTime(f.in)]);
    if (f.media) rows.push(["素材", f.media.name], ["素材信息", [f.media.width && f.media.height ? `${f.media.width}×${f.media.height}` : "",
      f.media.fps ? f.media.fps + " fps" : "", f.media.codec || "", f.media.duration ? M.formatTime(f.media.duration) : ""].filter(Boolean).join(" · ")]);
    for (const [k, v, swatch] of f.props) rows.push([k, v, swatch]);
    if (f.keyframes.length) rows.push(["关键帧", f.keyframes.join("、")]);
    if (f.locked) rows.push(["锁定", "是"]);
    if (f.disabled) rows.push(["停用", "是"]);
    for (const [k, v, swatch] of rows) {
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd");
      if (swatch) {   // 颜色: a swatch, then the value
        const chip = document.createElement("span");
        chip.className = "swatch"; chip.style.background = swatch;
        dd.appendChild(chip);
      }
      dd.appendChild(document.createTextNode(v));
      dl.append(dt, dd);
    }
  }
  function seek(t) {
    if (ch && Date.now() - editorSeen < 3000) { ch.postMessage({ type: "seek", t }); return; }
    fetch("/api/ui/command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cmd: "seek", t }) })
      .then((r) => { $("offline").hidden = r.ok; }).catch(() => { $("offline").hidden = false; });
  }

  async function load() {
    try {
      const r = await fetch("/api/project", { cache: "no-store" });
      if (!r.ok) return;
      project = await r.json();
      renderLines(); renderProps();
    } catch (e) { /* the engine is restarting: the next change event reloads */ }
  }
  if (ch) ch.onmessage = (e) => {
    const m = e.data || {};
    if (m.type !== "editor-state") return;
    const selChanged = !editor || editor.selId !== m.selId, revChanged = !!editor && editor.revision !== m.revision;
    editor = m; editorSeen = Date.now();
    $("offline").hidden = true;
    if (revChanged) load(); else { follow(); if (selChanged) renderProps(); }
  };
  /* No timeout on the editor's state: a background tab's timers are slowed (VV, #114: the highlight went after 3 s),
     so silence is not the editor going away. The last highlight and selection stay until the editor says otherwise;
     a click still checks (seek: the channel when it was heard from lately, else /api/ui/command). */
  new EventSource("/api/events").addEventListener("change", load);
  if (ch) ch.postMessage({ type: "hello" });
  load();
})();
