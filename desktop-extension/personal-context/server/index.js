#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeCandidates = [
  path.join(serverDir, "personal-context-server.mjs"),
  path.resolve(serverDir, "../../../lib/personal-context-server.mjs"),
];

async function loadRuntime() {
  for (const candidate of runtimeCandidates) {
    if (fs.existsSync(candidate)) {
      return import(pathToFileURL(candidate).href);
    }
  }

  throw new Error(
    `Could not locate the personal-context shared runtime. Checked:\n- ${runtimeCandidates.join("\n- ")}`,
  );
}

const { startPersonalContextServer } = await loadRuntime();

startPersonalContextServer(import.meta.url).catch((error) => {
  console.error("[personal-context] Server error:", error);
  process.exit(1);
});
