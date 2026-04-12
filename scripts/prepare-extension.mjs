#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const extensionSourceDir = path.join(
  repoRoot,
  "desktop-extension",
  "personal-context",
);
const bundledRuntimeSource = path.join(
  repoRoot,
  "lib",
  "personal-context-server.mjs",
);
const defaultOutputDir = path.join(
  repoRoot,
  ".build",
  "claude-extension",
  "personal-context",
);

function usage() {
  return `Prepare a self-contained Claude Desktop extension bundle.

Usage:
  npm run prepare:extension
  PERSONAL_CONTEXT_EXTENSION_TARGET="/absolute/path/to/local.unpacked.extension" npm run sync:extension
  npm run sync:extension -- --target "/absolute/path/to/local.unpacked.extension"

Options:
  --output <path>  Override the prepared bundle path.
  --target <path>  Refresh an installed unpacked extension directory.
  --sync           Require a target path and refresh it after preparing the bundle.
  --help           Show this message.
`;
}

function parseCliArgs(argv) {
  const options = {
    help: false,
    output: null,
    sync: false,
    target: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--help") {
      options.help = true;
      continue;
    }

    if (value === "--sync") {
      options.sync = true;
      continue;
    }

    if (value === "--output") {
      index += 1;
      options.output = argv[index] ?? null;
      continue;
    }

    if (value.startsWith("--output=")) {
      options.output = value.slice("--output=".length);
      continue;
    }

    if (value === "--target") {
      index += 1;
      options.target = argv[index] ?? null;
      continue;
    }

    if (value.startsWith("--target=")) {
      options.target = value.slice("--target=".length);
      continue;
    }

    throw new Error(`Unknown option: ${value}`);
  }

  return options;
}

function ensureExtensionDependenciesInstalled() {
  const nodeModulesDir = path.join(extensionSourceDir, "node_modules");

  if (!fs.existsSync(nodeModulesDir)) {
    throw new Error(
      "Extension dependencies are missing. Run `npm run install:extension` before preparing or syncing the unpacked extension.",
    );
  }
}

function createPreparedBundle() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "personal-context-extension-"),
  );
  const bundleDir = path.join(tempRoot, "personal-context");

  fs.cpSync(extensionSourceDir, bundleDir, { recursive: true });
  fs.copyFileSync(
    bundledRuntimeSource,
    path.join(bundleDir, "server", "personal-context-server.mjs"),
  );

  return { bundleDir, tempRoot };
}

function replaceDirectory(sourceDir, destinationDir) {
  const destinationParent = path.dirname(destinationDir);
  fs.mkdirSync(destinationParent, { recursive: true });

  const stagingParent = fs.mkdtempSync(
    path.join(destinationParent, ".personal-context-staging-"),
  );
  const stagingDir = path.join(stagingParent, path.basename(destinationDir));

  fs.cpSync(sourceDir, stagingDir, { recursive: true });
  fs.rmSync(destinationDir, { recursive: true, force: true });
  fs.renameSync(stagingDir, destinationDir);
  fs.rmSync(stagingParent, { recursive: true, force: true });
}

function resolveOptionalPath(value) {
  if (!value) {
    return null;
  }

  return path.resolve(value);
}

try {
  const options = parseCliArgs(process.argv.slice(2));

  if (options.help) {
    console.log(usage());
    process.exit(0);
  }

  ensureExtensionDependenciesInstalled();

  const outputDir = resolveOptionalPath(
    options.output ?? process.env.PERSONAL_CONTEXT_EXTENSION_BUILD_DIR,
  ) ?? defaultOutputDir;
  const targetDir = resolveOptionalPath(
    options.target ?? process.env.PERSONAL_CONTEXT_EXTENSION_TARGET,
  );

  if (options.sync && !targetDir) {
    throw new Error(
      "No extension target provided. Pass --target or set PERSONAL_CONTEXT_EXTENSION_TARGET.",
    );
  }

  const { bundleDir, tempRoot } = createPreparedBundle();

  try {
    replaceDirectory(bundleDir, outputDir);
    console.log(`Prepared self-contained extension bundle at: ${outputDir}`);

    if (targetDir && targetDir !== outputDir) {
      replaceDirectory(outputDir, targetDir);
      console.log(`Refreshed installed unpacked extension at: ${targetDir}`);
    } else if (targetDir) {
      console.log(`Target already matches prepared output: ${targetDir}`);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
} catch (error) {
  console.error(`[prepare-extension] ${error.message}`);
  process.exit(1);
}
