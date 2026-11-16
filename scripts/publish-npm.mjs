import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, chmod, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TARGETS = [
  { name: "saml-chaos-lab", access: "public" },
  { name: "@tensorjetai/saml-chaos-lab", access: "public" },
];

function parseArgs(argv) {
  const npmFlags = [];
  let only = null;
  let skipBuild = false;
  let packOnly = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      continue;
    }
    if (arg === "--skip-build") {
      skipBuild = true;
      continue;
    }
    if (arg === "--pack-only") {
      packOnly = true;
      continue;
    }
    if (arg === "--only" || arg === "--package") {
      only = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg.startsWith("--only=") || arg.startsWith("--package=")) {
      only = arg.slice(arg.indexOf("=") + 1);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Usage: pnpm publish:npm [--dry-run] [--pack-only] [--tag <dist-tag>] [--otp <code>] [--only <pkg>] [--skip-build]",
          "",
          "Builds saml-chaos-lab once and publishes clean staged tarballs for:",
          "  - saml-chaos-lab",
          "  - @tensorjetai/saml-chaos-lab",
        ].join("\n"),
      );
      process.exit(0);
    }
    npmFlags.push(arg);
  }

  const selected = only ? TARGETS.filter((target) => target.name === only) : TARGETS;
  if (selected.length === 0) {
    throw new Error(
      `Unknown package "${only}". Expected one of: ${TARGETS.map((t) => t.name).join(", ")}`,
    );
  }

  return { selected, npmFlags, skipBuild, packOnly };
}

function buildPublishManifest(sourcePkg, targetName) {
  return {
    name: targetName,
    version: sourcePkg.version,
    description: sourcePkg.description,
    license: sourcePkg.license,
    homepage: sourcePkg.homepage,
    repository: sourcePkg.repository,
    keywords: sourcePkg.keywords,
    type: sourcePkg.type,
    engines: sourcePkg.engines,
    exports: sourcePkg.exports,
    bin: sourcePkg.bin,
    files: sourcePkg.files,
    dependencies: sourcePkg.dependencies ?? {},
    publishConfig: { access: "public" },
  };
}

async function stagePackage(cliDir, stageDir, sourcePkg, target) {
  await mkdir(join(stageDir, "bin"), { recursive: true });
  await mkdir(join(stageDir, "dist"), { recursive: true });

  const binEntry = join(stageDir, "bin", "saml-chaos-lab.mjs");
  await cp(join(cliDir, "bin", "saml-chaos-lab.mjs"), binEntry);
  await chmod(binEntry, 0o755);

  await cp(join(cliDir, "dist"), join(stageDir, "dist"), {
    recursive: true,
    filter: (src) => basename(src) !== ".DS_Store",
  });

  await cp(join(cliDir, "README.md"), join(stageDir, "README.md"));
  await cp(join(cliDir, "LICENSE"), join(stageDir, "LICENSE"));

  const manifest = buildPublishManifest(sourcePkg, target.name);
  await writeFile(join(stageDir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function main() {
  const { selected, npmFlags, skipBuild, packOnly } = parseArgs(process.argv.slice(2));
  const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const cliDir = join(rootDir, "packages", "cli");

  const isLocalLivePublish =
    !packOnly && !npmFlags.includes("--dry-run") && !process.env.CI && !process.env.GITHUB_ACTIONS;
  if (isLocalLivePublish) {
    try {
      const user = execFileSync("npm", ["whoami"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
      console.log(`Authenticated on npm as: ${user}`);
    } catch {
      console.error(
        "Not logged in to npm (npm whoami failed).\n" +
          "To publish without local 2FA/login, push a v<version> tag to GitHub (triggers publish-npm.yml),\n" +
          "or run 'npm login' locally first.",
      );
      process.exit(1);
    }
  }

  if (!skipBuild) {
    execFileSync("pnpm", ["--filter", "saml-chaos-lab", "build"], {
      cwd: rootDir,
      stdio: "inherit",
    });
  }

  const sourcePkg = JSON.parse(await readFile(join(cliDir, "package.json"), "utf8"));
  const stagingRoot = await mkdtemp(join(tmpdir(), "saml-chaos-lab-npm-publish-"));

  try {
    for (const target of selected) {
      const folderName = target.name.replace(/^@/, "").replace(/\//g, "__");
      const stageDir = join(stagingRoot, folderName);
      await stagePackage(cliDir, stageDir, sourcePkg, target);

      const args = packOnly ? ["pack", "--dry-run"] : ["publish", ...npmFlags];
      if (!packOnly && target.access && !args.includes("--access")) {
        args.push("--access", target.access);
      }

      console.log(`\n=== npm ${args.join(" ")} (${target.name}@${sourcePkg.version}) ===`);
      execFileSync("npm", args, {
        cwd: stageDir,
        stdio: "inherit",
      });
    }
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

await main();
