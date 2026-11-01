/* Bounded-memory packet PTS inspection. Never use stale FLV format.duration. */
"use strict";
const { spawn } = require("child_process");
function probeTimeline(file, fallbackDurations = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", ["-v", "error", "-show_packets", "-show_entries", "packet=stream_index,pts_time,duration_time", "-of", "compact", file], {windowsHide:true, stdio:["ignore","pipe","ignore"]});
    const tracks = new Map();
    let buffer = "", error;
    const fail = message => { error ||= new Error(message); child.kill(); };
    const timer = setTimeout(() => fail("Packet scan timed out"), 120000);
    function drain(track) {
      track.pending.sort((a,b) => a.pts-b.pts);
      const packet = track.pending.shift();
      if (track.last && packet.pts < track.last.pts) { fail("PTS reorder exceeds inspection window"); return; }
      if (track.last) track.maxGap = Math.max(track.maxGap, packet.pts-track.last.pts-track.last.duration);
      track.last = packet;
      track.first = Math.min(track.first, packet.pts);
      track.end = Math.max(track.end, packet.pts+packet.duration);
    }
    function line(text) {
      if (!text.startsWith("packet|")) return;
      const fields = Object.fromEntries(text.trim().split("|").slice(1).filter(x => x.includes("=")).map(x => x.split("=")));
      const index = Number(fields.stream_index), pts = Number(fields.pts_time);
      let duration = Number(fields.duration_time), estimated = false;
      if (!Number.isFinite(duration) || duration <= 0) { duration = fallbackDurations[index]; estimated = true; }
      if (!Number.isInteger(index) || !Number.isFinite(pts) || !Number.isFinite(duration) || duration <= 0) { fail("Packet timestamps or durations unavailable"); return; }
      if (!tracks.has(index)) tracks.set(index, {index, pending:[], last:null, first:Infinity, end:-Infinity, maxGap:0, packets:0, estimatedDurations:0});
      const track = tracks.get(index); track.pending.push({pts,duration}); track.packets++;
      if (estimated) track.estimatedDurations++;
      // Allow B-frame reordering without buffering the entire recording.
      if (track.pending.length > 128) drain(track);
    }
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => {
      buffer += chunk;
      let i;
      while ((i=buffer.indexOf("\n")) !== -1) { line(buffer.slice(0,i)); buffer=buffer.slice(i+1); }
      if (buffer.length > 65536) fail("Invalid packet output");
    });
    child.once("error", e => { error=e; });
    child.once("close", code => {
      clearTimeout(timer);
      if (buffer) line(buffer);
      for (const track of tracks.values()) while (track.pending.length) drain(track);
      if (error || code !== 0 || !tracks.size) return reject(error || new Error("Packet scan failed"));
      const streams = [...tracks.values()].map(({pending,last,...track}) => track);
      const origin = Math.min(...streams.map(s=>s.first));
      resolve({origin, end:Math.max(...streams.map(s=>s.end)), streams});
    });
  });
}
module.exports = {probeTimeline};
