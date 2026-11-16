import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const version = process.argv[2];

if (!version || !SEMVER_RE.test(version)) {
  console.error("Usage: pnpm version:bump <semver>  (e.g. pnpm version:bump 0.1.3)");
  process.exit(1);
}

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));

async function updateJsonVersion(relPath) {
  const fullPath = join(rootDir, relPath);
  const pkg = JSON.parse(await readFile(fullPath, "utf8"));
  pkg.version = version;
  await writeFile(fullPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}

async function replaceAllMatching(relPath, pattern, replacement) {
  const fullPath = join(rootDir, relPath);
  const current = await readFile(fullPath, "utf8");
  if (!pattern.test(current)) {
    throw new Error(`Expected pattern ${pattern} not found in ${relPath}`);
  }
  const updated = current.replace(pattern, replacement);
  await writeFile(fullPath, updated, "utf8");
}

const packageManifests = [
  "package.json",
  "apps/idp/package.json",
  "fixtures/vulnerable-sp/package.json",
  "packages/browser-runner/package.json",
  "packages/cli/package.json",
  "packages/contracts/package.json",
  "packages/observability/package.json",
  "packages/saml-core/package.json",
  "packages/scenarios/package.json",
  "packages/target-safety/package.json",
];

for (const manifest of packageManifests) {
  await updateJsonVersion(manifest);
}

await replaceAllMatching(
  "packages/cli/README.md",
  /saml-chaos-lab@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/g,
  `saml-chaos-lab@${version}`,
);
await replaceAllMatching(
  "docs/limitations.md",
  /# Known limitations — v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/,
  `# Known limitations — v${version}`,
);

console.log(`Bumped SAML Chaos Lab OSS packages to ${version}`);
