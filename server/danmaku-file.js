/* Read a danmaku XML file from disk in pieces (Node: the MCP tool; the editor reads its File the same way).
 * The bytes are decoded as UTF-8 by a stream decoder, so a Chinese character split between two pieces stays whole,
 * and the file is never held in memory at once. A leading byte-order mark is dropped by the decoder. */
"use strict";
const fs = require("fs");
const Danmaku = require("../danmaku.js");

function readDanmakuFile(file, { highWaterMark = 1 << 20 } = {}) {
  return new Promise((resolve, reject) => {
    const parser = Danmaku.createParser();
    const stream = fs.createReadStream(file, { encoding: "utf8", highWaterMark });
    stream.on("data", (text) => { try { parser.push(text); } catch (e) { stream.destroy(); reject(e); } });
    stream.on("error", reject);
    stream.on("end", () => { try { resolve(parser.end()); } catch (e) { reject(e); } });
  });
}
module.exports = { readDanmakuFile };
