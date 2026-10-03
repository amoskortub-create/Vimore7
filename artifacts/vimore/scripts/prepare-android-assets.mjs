import { readFile, readdir, rm } from "node:fs/promises";
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
    normalizedName === "serviceworker.js" ||
    normalizedName === "manifest.json" ||
    normalizedName.endsWith(".webmanifest") ||
    normalizedName === "offline.html" ||
    normalizedName === "offline.htm" ||
    normalizedName.startsWith("service-worker.") ||
    normalizedName.startsWith("serviceworker.") ||
    normalizedName.startsWith("sw-") ||
    normalizedName.startsWith("workbox-") ||
    normalizedName.startsWith("precache-manifest")
  );
};

const forbiddenPwaCode =
  /(?:navigator|window)\s*(?:\.\s*serviceWorker|\[\s*["']serviceWorker["']\s*\])\s*(?:\.|\[)[\s\S]{0,200}?\bregister\b|caches\.(?:open|match)\s*\(|workbox|precache/i;

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

async function verifyNoPwaAssets(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await verifyNoPwaAssets(entryPath);
      continue;
    }

    if (excludedAsset(entry.name)) {
      throw new Error(
        `PWA/offline asset remains in native assets: ${path.relative(publicAssetsDir, entryPath)}`,
      );
    }

    if (/\.(?:html?|json|m?js|cjs|css)$/i.test(entry.name)) {
      const contents = await readFile(entryPath, "utf8");
      if (forbiddenPwaCode.test(contents)) {
        throw new Error(
          `Service worker or offline cache code remains in native asset: ${path.relative(publicAssetsDir, entryPath)}`,
        );
      }
    }
  }
}

await readdir(publicAssetsDir);
const removed = await removePwaAssets(publicAssetsDir);
await verifyNoPwaAssets(publicAssetsDir);
console.log(`[android] PWA/offline assets excluded: ${removed}`);
console.log("[android] verified no service worker or offline cache assets");
