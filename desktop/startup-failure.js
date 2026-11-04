'use strict';
// Why the desktop app could not start, said in the box the main process shows (VV's review of #111). One case has its
// own words: another MontClip — most likely the one in Cindy — is editing the same data folder (writer-lock.js), so
// closing and reopening this one, or "another folder", would not help. The main process checks the lock before it
// starts the server; when the two start at the same moment the server refuses and says DATA_DIR_IN_USE on stderr.

/** A live holder of the data folder's writer lock → the start-up error for it, else null. */
function dataDirInUse(dataDir, holder) {
  const h = holder(dataDir);
  return h ? Object.assign(new Error('dataDirInUse'), { textKey: 'dataDirInUse', holder: { shell: h.shell || null, pid: h.pid, port: h.port || null } }) : null;
}

/** The server stopped while starting: its stderr tells whether it was the writer lock. */
function exitedAtStart(stderr) {
  return /DATA_DIR_IN_USE|Another MontClip \(/.test(String(stderr || ''))
    ? Object.assign(new Error('dataDirInUse'), { textKey: 'dataDirInUse' })
    : Object.assign(new Error('serviceExitedAtStart'), { textKey: 'serviceExitedAtStart' });
}

/** The message box for a start-up error, in the interface language `t` (native-text.js). */
function startFailureBox(error, t) {
  if (error && error.textKey === 'dataDirInUse')
    return { title: t.dataDirInUseTitle, message: t.dataDirInUse, detail: t.dataDirInUseHint, buttons: [t.dataDirInUseOk] };
  return { title: t.startFailedTitle,
    message: `${(error && error.textKey && t[error.textKey]) || String((error && error.message) || error)}\n${t.startFailedHint}`,
    buttons: [t.ok] };
}

module.exports = { dataDirInUse, exitedAtStart, startFailureBox };
