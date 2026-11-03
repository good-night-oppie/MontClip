/* The page's copy of the MCP tools' names and schemas (P4, the plan list): read once from the desktop main process, before
   capabilities.js, so the page's table has every capability and the plan list can show each step's plain sentence. Read
   only; risks and sentences still come from capabilities.js itself, and every decision is the main process's. Without the
   desktop host the page's table keeps only the two proposals. */
(function () {
  try {
    const r = window.montclipCapabilities && window.montclipCapabilities.get();
    if (r && r.ok && Array.isArray(r.capabilities)) window.MontClipMcpTools = r.capabilities.filter((c) => c.source === "mcp").map((c) => ({ name: c.name, inputSchema: c.schema }));
  } catch { /* the page's table keeps only the two proposals */ }
})();
