"use strict";
/** Install before service modules capture child_process methods. Desktop only:
 * retain actual child handles, never enumerate or kill other applications. */
function trackOwnedProcesses(cp) {
  const children = new Set(), originals = {}, wrappers = {};
  let stopped = false;
  for (const name of ["spawn", "execFile"]) {
    originals[name] = cp[name];
    wrappers[name] = cp[name] = function (...args) {
      if (stopped) throw new Error("local editor service is shutting down");
      const child = originals[name].apply(cp, args);
      children.add(child);
      const forget = () => children.delete(child);
      child.once("exit", forget);
      child.once("error", forget);
      return child;
    };
  }
  return {
    stop() {
      stopped = true;
      for (const child of children) { try { child.kill(); } catch {} }
    },
    restore() {
      for (const name of Object.keys(originals)) if (cp[name] === wrappers[name]) cp[name] = originals[name];
    },
  };
}
module.exports = { trackOwnedProcesses };
