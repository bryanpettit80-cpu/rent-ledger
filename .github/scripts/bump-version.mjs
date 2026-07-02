import { readFileSync, writeFileSync } from "node:fs";

const requestedVersion = readVersionArg();
const requestedDate = readDateArg() || new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
}).format(new Date());

const files = ["app.js", "index.html", "sw.js"];
const app = readFileSync("app.js", "utf8");
const currentVersion = app.match(/const APP_VERSION = "(rent-ledger-v\d+)"/)?.[1];

if (!currentVersion) {
  throw new Error("Unable to find APP_VERSION in app.js.");
}

const nextVersion = requestedVersion || incrementVersion(currentVersion);
if (!/^rent-ledger-v\d+$/.test(nextVersion)) {
  throw new Error(`Version must look like rent-ledger-vNN, got ${nextVersion}.`);
}

for (const file of files) {
  const updated = readFileSync(file, "utf8")
    .replace(/rent-ledger-v\d+/g, nextVersion)
    .replace(/(<strong id="splashCommitDate">)([^<]+)(<\/strong>)/, `$1${requestedDate}$3`)
    .replace(/(const APP_COMMIT_DATE = ")([^"]+)(")/, `$1${requestedDate}$3`);
  writeFileSync(file, updated);
}

console.log(`Updated Rent Ledger static version ${currentVersion} -> ${nextVersion} (${requestedDate}).`);

function readDateArg() {
  const dateIndex = process.argv.indexOf("--date");
  if (dateIndex < 0) return "";
  return process.argv[dateIndex + 1] || "";
}

function readVersionArg() {
  return process.argv.slice(2).find((arg, index, args) => arg !== "--date" && args[index - 1] !== "--date") || "";
}

function incrementVersion(version) {
  const number = Number(version.match(/\d+$/)?.[0] || 0);
  return `rent-ledger-v${number + 1}`;
}
