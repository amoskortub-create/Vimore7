import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const publicAssetsDir = path.join(
  projectDir,
  "android",
  "app",
  "src",
  "main",
  "assets",
  "public",
);

const excludedAsset = (fileName) => {
  const normalizedName = fileName.toLowerCase();
  return (
    normalizedName === "sw.js" ||
    normalizedName === "service-worker.js" ||
    normalizedName === "manifest.json" ||
    normalizedName.endsWith(".webmanifest") ||
    normalizedName === "offline.html" ||
    normalizedName.startsWith("workbox-") ||
    normalizedName.startsWith("precache-manifest")
  );
};

async function removePwaAssets(directory) {
  let removed = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      removed += await removePwaAssets(entryPath);
    } else if (excludedAsset(entry.name)) {
      await rm(entryPath);
      console.log(
        `[android] excluded ${path.relative(publicAssetsDir, entryPath)}`,
      );
      removed += 1;
    }
  }
  return removed;
}

const removed = await removePwaAssets(publicAssetsDir);
console.log(`[android] PWA/offline assets excluded: ${removed}`);
