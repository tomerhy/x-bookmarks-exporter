const fs = require("fs");
const path = require("path");

const manifestPath = path.join(__dirname, "manifest.json");
const input = process.argv[2] || "patch";

const parseVersion = (value) => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) return null;
  return match.slice(1).map(Number);
};

const bump = (current, mode) => {
  const parsed = parseVersion(current);
  if (!parsed) throw new Error(`Invalid version: ${current}`);
  const [major, minor, patch] = parsed;

  if (parseVersion(mode)) return mode;
  if (mode === "major") return `${major + 1}.0.0`;
  if (mode === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};

const run = () => {
  const raw = fs.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(raw);
  const current = manifest.version;
  const next = bump(current, input);

  manifest.version = next;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Version: ${current} -> ${next}`);
};

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
