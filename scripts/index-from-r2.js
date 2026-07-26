// Builds data/index.json directly from the R2 bucket, so the portal's catalog
// matches exactly what's stored. Reads credentials from .env.
//
//   node scripts/index-from-r2.js
//
// Only metadata (keys, folders) is written to the index — no file contents,
// no credentials. Safe to commit the resulting data/index.json.

import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import {
  S3Client,
  ListObjectsV2Command,
  ListBucketsCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

const PORTAL_INDEX_KEY = "portal-index.json";

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
} = process.env;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error("Missing R2_* env vars. Check your .env file.");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const SKIP = new Set([".ds_store", "thumbs.db"]);

function prettyTitle(filename) {
  return filename; // keep the real filename as the title
}

async function resolveBucket() {
  if (R2_BUCKET) return R2_BUCKET;
  const out = await client.send(new ListBucketsCommand({}));
  const names = (out.Buckets || []).map((b) => b.Name);
  if (!names.length) throw new Error("No buckets found on this account.");
  console.log("Buckets:", names.join(", "));
  return names[0];
}

async function main() {
  const bucket = await resolveBucket();
  console.log(`Listing bucket: ${bucket}`);

  const index = [];
  let token;
  do {
    const out = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: token,
      })
    );
    for (const obj of out.Contents || []) {
      const key = obj.Key;
      if (!key || key.endsWith("/")) continue; // skip folder markers
      if (key === PORTAL_INDEX_KEY) continue; // don't index the catalog itself
      const base = key.split("/").pop();
      if (SKIP.has(base.toLowerCase())) continue;
      const folder = key.includes("/")
        ? key.slice(0, key.lastIndexOf("/"))
        : "";
      index.push({
        key, // exact object key in R2
        path: key,
        title: prettyTitle(base),
        folder,
        tags: folder ? folder.split("/") : [],
        size: obj.Size,
      });
    }
    token = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (token);

  index.sort((a, b) => a.key.localeCompare(b.key));

  const body = JSON.stringify(index, null, 2);
  const outFile = path.join(process.cwd(), "data", "index.json");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, body);
  console.log(`Indexed ${index.length} objects → ${outFile} (local copy)`);

  // Upload the catalog INTO the private bucket so the server loads it from
  // there — keeps filenames (which may include student names) out of the repo.
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: PORTAL_INDEX_KEY,
      Body: body,
      ContentType: "application/json",
    })
  );
  console.log(`Uploaded catalog → r2://${bucket}/${PORTAL_INDEX_KEY}`);
  // Show a small sample + folder breakdown
  const byFolder = {};
  for (const d of index) byFolder[d.folder || "(root)"] = (byFolder[d.folder || "(root)"] || 0) + 1;
  console.log("Folders:", JSON.stringify(byFolder, null, 2));
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
