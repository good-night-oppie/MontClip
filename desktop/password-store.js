'use strict';
// The key store on Linux (Deja, 2026-11-05, after P9; QQ's review of #171). Electron picks its key store from the desktop
// it detects. On a desktop it knows (GNOME, KDE, XFCE, …) that choice is right and is left alone — KDE uses KWallet, so
// forcing libsecret there would turn "can save" into "refused". On a desktop it does not know (openbox, a VNC session,
// xvfb) it falls back to basic_text — a fixed built-in password — and MontClip then refuses to save the key
// (desktop/agent-service.js). Only there is the system keyring (libsecret) asked for.
// Checked on europa (2026-11-05): with the keyring it is used; with no secret service, no session bus, or no libsecret the
// app still starts, the store reads unavailable and encrypting throws, so the key is refused, never written in plain text.
// A --password-store the user passes is theirs; Windows and macOS have their own key store and are not touched.
//
// desktopEnvironment() follows Chromium's base::nix::GetDesktopEnvironment (base/nix/xdg_util.cc, branch-heads/8078 =
// Chromium 156, the one in Electron 45.2.1), and AUTO_BACKEND follows its SelectBackend (components/os_crypt/sync/
// key_storage_util_linux.cc): KDE 4/5/6 → KWallet; Cinnamon, Deepin, GNOME, Pantheon, UKUI, Unity, XFCE, COSMIC →
// libsecret; KDE 3, LXQt and anything else → basic_text.
function desktopEnvironment(env){
 const xdg=env.XDG_CURRENT_DESKTOP;
 if(xdg!==undefined)for(const value of String(xdg).split(':').map(s=>s.trim()).filter(Boolean)){
  if(value==='Unity')return String(env.DESKTOP_SESSION||'').includes('gnome-fallback')?'GNOME':'UNITY';
  if(value==='Deepin')return 'DEEPIN';
  if(value==='GNOME')return 'GNOME';
  if(value==='X-Cinnamon')return 'CINNAMON';
  if(value==='KDE'){const v=env.KDE_SESSION_VERSION||'';return v==='5'?'KDE5':v==='6'?'KDE6':'KDE4';}
  if(value==='Pantheon')return 'PANTHEON';
  if(value==='XFCE')return 'XFCE';
  if(value==='UKUI')return 'UKUI';
  if(value==='LXQt')return 'LXQT';
  if(value==='COSMIC')return 'COSMIC';
 }
 const session=String(env.DESKTOP_SESSION||'');
 if(session==='deepin')return 'DEEPIN';
 if(session==='gnome'||session==='mate')return 'GNOME';
 if(session==='kde4'||session==='kde-plasma')return 'KDE4';
 if(session==='kde')return env.KDE_SESSION_VERSION!==undefined?'KDE4':'KDE3';
 if(session.includes('xfce')||session==='xubuntu')return 'XFCE';
 if(session==='ukui')return 'UKUI';
 if(env.GNOME_DESKTOP_SESSION_ID!==undefined)return 'GNOME';
 if(env.KDE_FULL_SESSION!==undefined)return env.KDE_SESSION_VERSION!==undefined?'KDE4':'KDE3';
 return 'OTHER';
}
const AUTO_BACKEND=Object.freeze({KDE4:'kwallet',KDE5:'kwallet5',KDE6:'kwallet6',CINNAMON:'gnome-libsecret',DEEPIN:'gnome-libsecret',GNOME:'gnome-libsecret',
 PANTHEON:'gnome-libsecret',UKUI:'gnome-libsecret',UNITY:'gnome-libsecret',XFCE:'gnome-libsecret',COSMIC:'gnome-libsecret',KDE3:'basic',LXQT:'basic',OTHER:'basic'});
function passwordStoreSwitch({platform=process.platform,argv=process.argv,env=process.env}={}){
 if(platform!=='linux')return null;
 if(argv.some(a=>a==='--password-store'||String(a).startsWith('--password-store=')))return null;
 return AUTO_BACKEND[desktopEnvironment(env)]==='basic'?'gnome-libsecret':null;
}
module.exports={passwordStoreSwitch,desktopEnvironment,AUTO_BACKEND};
