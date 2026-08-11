import { readFile, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const MAX_ENTRY_GZIP_BYTES = 200 * 1024;
const MAX_CHUNK_BYTES = 500 * 1024;
const assetsDirectory = new URL("../dist/assets/", import.meta.url);
const indexHtml = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const entryMatch = indexHtml.match(/<script[^>]+src="\/assets\/([^"]+\.js)"/);
if (!entryMatch) throw new Error("Could not find the production entry script in dist/index.html.");

const files = (await readdir(assetsDirectory)).filter((file) => file.endsWith(".js"));
const rows = [];
let failed = false;
for (const file of files) {
  const source = await readFile(new URL(file, assetsDirectory));
  const gzipBytes = gzipSync(source).byteLength;
  rows.push({ file, bytes: source.byteLength, gzipBytes });
  if (source.byteLength > MAX_CHUNK_BYTES) failed = true;
  if (file === entryMatch[1] && gzipBytes > MAX_ENTRY_GZIP_BYTES) failed = true;
}

rows.sort((left, right) => right.bytes - left.bytes);
for (const row of rows) {
  const marker = row.file === entryMatch[1] ? "entry" : "chunk";
  console.log(`${marker.padEnd(5)} ${(row.bytes / 1024).toFixed(1).padStart(7)} KiB ${(row.gzipBytes / 1024).toFixed(1).padStart(7)} KiB gzip  ${row.file}`);
}
if (failed) throw new Error("Bundle budget exceeded: entry gzip must be <= 200 KiB and every chunk <= 500 KiB.");
