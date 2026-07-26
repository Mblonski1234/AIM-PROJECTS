// Builds data/index.json — the tiny searchable catalog of your files.
//
// Two ways to use it:
//
//   1) From a local folder (after you export/download the AIM files):
//        node scripts/build-index.js --dir "C:/path/to/exported/AIM"
//      It walks the folder, records every file's title/path/folder/extension,
//      and (for R2) sets `key` to the relative path — which should match the
//      object key you upload to your R2 bucket.
//
//   2) From a listing you already have (e.g. a CSV/JSON export) — adapt the
//      `fromDir` logic below.
//
// The index intentionally holds only metadata (names, folders, tags), never the
// file contents — so it stays tiny and safe to keep in the GitHub repo.

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const dir = arg("--dir", null);
const out = arg("--out", path.join(process.cwd(), "data", "index.json"));

// Skip system/junk files.
const SKIP = new Set([".ds_store", "thumbs.db", ".gitkeep"]);

function walk(root, base = root, acc = []) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walk(full, base, acc);
    } else {
      if (SKIP.has(entry.name.toLowerCase())) continue;
      const rel = path.relative(base, full).split(path.sep).join("/");
      const folder = path.dirname(rel) === "." ? "" : path.dirname(rel);
      acc.push({
        key: rel, // object key in R2 (upload preserving this path)
        path: rel, // used in local demo mode
        title: entry.name,
        folder,
        tags: folder ? folder.split("/") : [],
      });
    }
  }
  return acc;
}

if (!dir) {
  console.error(
    'Usage: node scripts/build-index.js --dir "C:/path/to/exported/AIM" [--out data/index.json]'
  );
  process.exit(1);
}
if (!fs.existsSync(dir)) {
  console.error(`Folder not found: ${dir}`);
  process.exit(1);
}

const index = walk(dir);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(index, null, 2));
console.log(`Indexed ${index.length} files → ${out}`);
