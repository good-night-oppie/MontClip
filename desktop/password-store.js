'use strict';
// The key store on Linux (Deja, 2026-11-05, after P9). Electron picks its key store from the desktop it detects; on a desktop
// it does not know (openbox, a VNC session, xvfb) it falls back to basic_text — a fixed built-in password — and MontClip then
// refuses to save the key (desktop/agent-service.js). Asking for the system keyring (libsecret) by default makes that rare.
// Checked on europa (2026-11-05): with the keyring it is used; with no secret service, no session bus, or no libsecret the
// app still starts, the store reads unavailable and encrypting throws, so the key is refused, never written in plain text.
// A --password-store the user passes is theirs; Windows and macOS have their own key store and are not touched.
function passwordStoreSwitch({platform=process.platform,argv=process.argv}={}){
 if(platform!=='linux')return null;
 if(argv.some(a=>a==='--password-store'||String(a).startsWith('--password-store=')))return null;
 return 'gnome-libsecret';
}
module.exports={passwordStoreSwitch};
