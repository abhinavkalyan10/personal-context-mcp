#!/usr/bin/env node

import { startPersonalContextServer } from "../lib/personal-context-server.mjs";

startPersonalContextServer(import.meta.url).catch((error) => {
  console.error("[personal-context] Server error:", error);
  process.exit(1);
});
