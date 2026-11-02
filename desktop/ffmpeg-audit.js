'use strict';
/* What the packaged FFmpeg may not contain (release-check; docs/decisions/2026-11-02-h264-encoder.md).
   - GPL or non-free components: the package is LGPL.
   - libopenh264 (Deja 2026-11-02): a release blocker, not a warning. Every BtbN variant links it,
     so the manifest must point at our own --disable-libopenh264 build and say openh264:false. */
const GPL_ONLY = /--enable-(gpl|nonfree|libx264|libx265|libxvid|libxavs2?|libdavs2|libvidstab|frei0r|librubberband|libcdio|avisynth)\b/;

/** configuration: the "configuration:" line of `ffmpeg -version`; encoders: `ffmpeg -encoders` output. */
function auditBuild({ configuration = "", encoders = "" } = {}) {
  const problems = [];
  if (!/^configuration:/m.test(configuration)) return [{ code: "NO_CONFIGURATION", detail: "could not read the build configuration" }];
  const gpl = configuration.match(GPL_ONLY);
  if (gpl) problems.push({ code: "GPL", detail: gpl[0] });
  if (/--enable-libopenh264\b/.test(configuration) || /^\s*\S+\s+libopenh264\b/m.test(encoders))
    problems.push({ code: "OPENH264", detail: "the build links libopenh264" });
  return problems;
}

/** The pinned manifest (desktop/ffmpeg-manifest.json). */
function auditManifest(manifest = {}) {
  const problems = [];
  if (manifest.openh264 !== false) problems.push({ code: "OPENH264_UNDECLARED", detail: "the manifest must declare openh264: false" });
  for (const [plat, b] of Object.entries(manifest.builds || {}))
    if (/^https:\/\/github\.com\/BtbN\//i.test((b && b.url) || ""))
      problems.push({ code: "OPENH264_SOURCE", detail: `${plat}: BtbN builds link libopenh264; use the --disable-libopenh264 build` });
  return problems;
}

/** licenses/ffmpeg/inventory.json: every library in the build must have its licence text from the
    pinned ref and a classification; a GPL-looking text must have been read by hand (reviewed). */
function auditLicenses(list = []) {
  const problems = [];
  for (const e of list) {
    if (!e.files || !e.files.length) { problems.push({ code: "LICENSE_MISSING", detail: `${e.name}: no licence text collected at ${e.ref}` }); continue; }
    const kinds = e.kinds || [];
    if (!e.reviewed && (!kinds.length || kinds.includes("?") || kinds.some((k) => /^GPL/.test(k))))
      problems.push({ code: "LICENSE_UNCLASSIFIED", detail: `${e.name}: licence not classified or GPL-looking text not read` });
  }
  return problems;
}

module.exports = { auditBuild, auditManifest, auditLicenses, GPL_ONLY };
