import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..", "..");
const outputDirectory = join(repositoryRoot, "_site");
const runtimeFiles = [
  "index.html",
  "privacy.html",
  "terms.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "sw.js",
  "_headers",
];
const assetsDirectory = join(repositoryRoot, "assets");

for (const relativePath of runtimeFiles) {
  const sourcePath = join(repositoryRoot, relativePath);
  if (!existsSync(sourcePath)) {
    throw new Error(`Required static runtime file is missing: ${relativePath}`);
  }
}

if (!existsSync(assetsDirectory)) {
  throw new Error("Required static runtime directory is missing: assets");
}

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

for (const relativePath of runtimeFiles) {
  cpSync(join(repositoryRoot, relativePath), join(outputDirectory, relativePath));
}

cpSync(assetsDirectory, join(outputDirectory, "assets"), { recursive: true });
writeFileSync(join(outputDirectory, ".nojekyll"), "", "utf8");

console.log(`Prepared ${runtimeFiles.length} runtime files and assets in ${outputDirectory}`);
