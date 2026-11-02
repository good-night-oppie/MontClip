'use strict';
/* Zip a folder into a new zip whose single top-level folder is that folder's name (Windows: PowerShell + .NET's
   ZipArchive; no dependency). Every entry is written by name, with "/" between the parts — the zip format's separator;
   .NET Framework's ZipFile.CreateFromDirectory writes "\" (QQ, #57) — and names are UTF-8 with the flag set, so
   先看我-使用说明.txt opens right in Explorer and Expand-Archive. An existing zip is never overwritten; a failed run
   leaves no zip behind. Hidden and system files go in too (-Force; QQ, cf45bd8), and the zip must hold every file
   under the folder, or it is removed and zipDir throws. */
const fs = require('node:fs'), path = require('node:path');
const { spawnSync } = require('node:child_process');

const PS = [
  "$ErrorActionPreference = 'Stop'",
  'Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem',
  '$src = (Get-Item -LiteralPath $env:MC_ZIP_SRC).FullName.TrimEnd([char]92)',
  '$base = Split-Path -Parent $src',
  '$fs = [IO.File]::Open($env:MC_ZIP_OUT, [IO.FileMode]::CreateNew)',
  'try {',
  '  $zip = New-Object IO.Compression.ZipArchive($fs, [IO.Compression.ZipArchiveMode]::Create, $false, [Text.Encoding]::UTF8)',
  '  try {',
  '    Get-ChildItem -LiteralPath $src -Recurse -File -Force | Sort-Object FullName | ForEach-Object {',
  '      $name = $_.FullName.Substring($base.Length + 1).Replace([char]92, [char]47)',
  '      [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $name, [IO.Compression.CompressionLevel]::Optimal)',
  '    }',
  '  } finally { $zip.Dispose() }',
  '} finally { $fs.Dispose() }',
].join('; ');

function zipDir(srcDir, outZip) {
  if (process.platform !== 'win32') throw Error('zipDir runs on Windows');
  if (fs.existsSync(outZip)) throw Error(outZip + ' exists');
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS],
    { encoding: 'utf8', windowsHide: true, env: { ...process.env, MC_ZIP_SRC: srcDir, MC_ZIP_OUT: outZip } });
  if (r.status !== 0) {
    // only a zip this run created: CreateNew refused an existing one before writing
    if (!/already exists|CreateNew/.test(r.stderr || '')) fs.rmSync(outZip, { force: true });
    throw Error('zip failed: ' + String(r.stderr || '').trim().split('\n')[0].slice(0, 300));
  }
  // every file under the folder (Node lists hidden ones too) is in the zip, by name
  const files = [], top = path.basename(path.resolve(srcDir));
  (function list(d, rel) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const r = rel + '/' + e.name; e.isDirectory() ? list(path.join(d, e.name), r) : files.push(r.slice(1)); } })(path.resolve(srcDir), '/' + top);
  const entries = require('./zip-entries.cjs').zipEntries(outZip).map((e) => e.name);
  const want = new Set(files);
  if (entries.length !== files.length || entries.some((n) => !want.has(n))) {
    fs.rmSync(outZip, { force: true });
    throw Error(`zip incomplete: ${entries.length} entries for ${files.length} files`);
  }
}
module.exports = { zipDir };
