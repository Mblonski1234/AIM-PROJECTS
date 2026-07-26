// AIM Portal — password-gated, searchable front-end for program materials.
//
// Two storage modes, chosen automatically:
//   • R2/S3 mode  — if R2_* env vars are set, downloads are served as short-lived
//                   presigned URLs straight from object storage (scales to any size).
//   • Local mode  — otherwise, files are served from the local ./files folder
//                   (used for the demo so you can run it with zero cloud setup).
//
// Auth is a single shared password (SITE_PASSWORD). A signed cookie keeps the
// session; no user accounts to manage.

import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// --- Config -----------------------------------------------------------------
const SITE_PASSWORD = process.env.SITE_PASSWORD || "aim-demo"; // CHANGE in prod
const SESSION_SECRET =
  process.env.SESSION_SECRET || "dev-secret-change-me-in-production";
const R2 = {
  accountId: process.env.R2_ACCOUNT_ID,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucket: process.env.R2_BUCKET,
};
const R2_ENABLED = Boolean(
  R2.accountId && R2.accessKeyId && R2.secretAccessKey && R2.bucket
);

// --- Search index -----------------------------------------------------------
// index.json is produced by scripts/build-index.js. Falls back to the sample
// so the demo runs out of the box.
function loadIndex() {
  const primary = path.join(__dirname, "data", "index.json");
  const sample = path.join(__dirname, "data", "index.sample.json");
  const file = fs.existsSync(primary) ? primary : sample;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}
let INDEX = loadIndex();

// Lightweight keyword search over title / path / tags. Ranks by how many of the
// query's words match, with title matches weighted highest.
function search(query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return INDEX.map((doc) => {
    const title = (doc.title || "").toLowerCase();
    const hay = [doc.title, doc.path, (doc.tags || []).join(" ")]
      .join(" ")
      .toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (!hay.includes(t)) return { doc, score: -1 };
      score += 1;
      if (title.includes(t)) score += 2;
    }
    return { doc, score };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 100)
    .map((r) => r.doc);
}

// --- Auth -------------------------------------------------------------------
function sign(value) {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(value)
    .digest("hex");
}
const AUTH_VALUE = "ok";
const AUTH_COOKIE = `auth=${AUTH_VALUE}.${sign(AUTH_VALUE)}`;

function isAuthed(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)auth=([^;]+)/);
  if (!match) return false;
  const [value, sig] = decodeURIComponent(match[1]).split(".");
  return value === AUTH_VALUE && sig === sign(AUTH_VALUE);
}

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// --- Public routes ----------------------------------------------------------
app.post("/api/login", (req, res) => {
  const submitted = (req.body.password || "").toString();
  // constant-time compare
  const a = Buffer.from(submitted);
  const b = Buffer.from(SITE_PASSWORD);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) return res.status(401).json({ error: "Incorrect password" });
  res.setHeader(
    "Set-Cookie",
    `${AUTH_COOKIE}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 12}`
  );
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  res.setHeader("Set-Cookie", "auth=; HttpOnly; Path=/; Max-Age=0");
  res.json({ ok: true });
});

app.get("/api/session", (req, res) => {
  res.json({ authed: isAuthed(req) });
});

// --- Gate everything below --------------------------------------------------
function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: "Not authenticated" });
}

app.get("/api/search", requireAuth, (req, res) => {
  const q = (req.query.q || "").toString().trim();
  res.json({ query: q, count: 0, results: search(q) });
});

// Returns a URL the browser can use to open/download a file. In R2 mode this is
// a short-lived presigned URL; in local mode it's a path served by this app.
app.get("/api/file", requireAuth, async (req, res) => {
  const key = (req.query.key || "").toString();
  const doc = INDEX.find((d) => d.key === key || d.path === key);
  if (!doc) return res.status(404).json({ error: "Not found" });

  if (R2_ENABLED) {
    try {
      const { S3Client, GetObjectCommand } = await import(
        "@aws-sdk/client-s3"
      );
      const { getSignedUrl } = await import(
        "@aws-sdk/s3-request-presigner"
      );
      const client = new S3Client({
        region: "auto",
        endpoint: `https://${R2.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: R2.accessKeyId,
          secretAccessKey: R2.secretAccessKey,
        },
      });
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: R2.bucket, Key: doc.key }),
        { expiresIn: 300 }
      );
      return res.json({ url });
    } catch (err) {
      console.error("presign failed", err);
      return res.status(500).json({ error: "Could not generate link" });
    }
  }
  // Local demo mode
  return res.json({ url: `/files/${doc.path}` });
});

// Serve local files only in demo mode, and only to authed users.
if (!R2_ENABLED) {
  app.use(
    "/files",
    (req, res, next) => (isAuthed(req) ? next() : res.status(401).end()),
    express.static(path.join(__dirname, "files"))
  );
}

// Static front-end (login page + app). These are safe to serve unauthenticated;
// the data behind them is gated by the API routes above.
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`AIM Portal running on http://localhost:${PORT}`);
  console.log(`Storage mode: ${R2_ENABLED ? "Cloudflare R2" : "local ./files (demo)"}`);
  console.log(`Indexed documents: ${INDEX.length}`);
});
