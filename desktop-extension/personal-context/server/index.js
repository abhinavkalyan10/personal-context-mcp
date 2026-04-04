#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod";

const serverFilePath = fileURLToPath(import.meta.url);
const serverDir = path.dirname(serverFilePath);
const debugEnabled = process.env.PERSONAL_CONTEXT_DEBUG === "1";

const DYNAMIC_FILE_NAMES = [
  "current-priorities",
  "active-campaigns",
  "recent-learnings",
  "message-tests",
  "account-patterns",
];

const INBOX_FILE_NAMES = ["raw-notes", "core-update-proposals"];

const WRITABLE_FILE_NAMES = new Set([...DYNAMIC_FILE_NAMES, ...INBOX_FILE_NAMES]);

const SECTION_REWRITE_ALLOWLIST = new Map([
  ["current-priorities", new Set(["## Active Priorities", "## Notes"])],
  ["active-campaigns", new Set(["## Campaigns", "## Suggested Entry Format"])],
  ["recent-learnings", new Set(["## Learnings", "## Entry Guidance"])],
  ["message-tests", new Set(["## Tests", "## Suggested Entry Format"])],
  ["account-patterns", new Set(["## Patterns", "## Suggested Entry Format"])],
]);

const APPEND_TARGET_SECTIONS = new Map([
  ["current-priorities", "## Active Priorities"],
  ["active-campaigns", "## Campaigns"],
  ["recent-learnings", "## Learnings"],
  ["message-tests", "## Tests"],
  ["account-patterns", "## Patterns"],
  ["raw-notes", "## Notes"],
  ["core-update-proposals", "## Proposed Updates"],
]);

const DEFAULT_FILE_CONTENTS = {
  dynamic: {
    "current-priorities.md": `# Current Priorities

## Purpose
- This file captures live priorities that are likely to change over time.
- Keep entries concise, current, and decision-useful.
- Update this file only when priorities meaningfully change.

## Active Priorities
- No live priorities recorded yet.

## Notes
- Prefer updating this file with short bullets rather than long narrative.
- Remove stale priorities instead of letting them accumulate.
`,
    "active-campaigns.md": `# Active Campaigns

## Purpose
- This file tracks campaigns, outbound motions, and account clusters currently in flight.
- Each campaign entry should make it easy for an AI tool to understand the target, the angle, and the current state.

## Campaigns
- No active campaigns recorded yet.

## Suggested Entry Format
- Campaign name:
- Target segment:
- Trigger or signal:
- Core friction:
- Offer or pilot angle:
- Current status:
`,
    "recent-learnings.md": `# Recent Learnings

## Purpose
- This file is the main working-memory log for durable learnings from research, outbound, messaging, and account work.
- Capture only lessons worth reusing.

## Learnings
- No learnings recorded yet.

## Entry Guidance
- Include what was learned.
- Include why it matters.
- Include the evidence source when relevant.
`,
    "message-tests.md": `# Message Tests

## Purpose
- Track messaging experiments, subject-line ideas, hooks, and framing tests.
- Keep this focused on what was tried and what happened.

## Tests
- No message tests recorded yet.

## Suggested Entry Format
- Test:
- Audience:
- Hypothesis:
- Result:
- Next move:
`,
    "account-patterns.md": `# Account Patterns

## Purpose
- Capture repeatable account-level or persona-level patterns that show up across research and outreach.
- This should help future prospecting feel smarter over time.

## Patterns
- No account patterns recorded yet.

## Suggested Entry Format
- Pattern:
- Where it appears:
- Why it matters:
- How to use it in outreach:
`,
  },
  inbox: {
    "raw-notes.md": `# Raw Notes Inbox

## Purpose
- Temporary capture zone for rough observations, incomplete notes, and items that have not yet earned promotion into dynamic memory or core context.
- This file can be noisy. Clean it up regularly.

## Notes
- No raw notes recorded yet.
`,
    "core-update-proposals.md": `# Core Update Proposals

## Purpose
- Capture suggested changes to protected core files without editing them directly.
- Review proposals manually before promoting anything into core context.

## Proposed Updates
- No core update proposals recorded yet.
`,
  },
};

function debugLog(message) {
  if (debugEnabled) {
    process.stderr.write(`[personal-context] ${message}\n`);
  }
}

function readExtensionConfiguredContextRoot() {
  const parts = serverDir.split(path.sep);
  const extensionsIndex = parts.lastIndexOf("Claude Extensions");

  if (extensionsIndex === -1 || extensionsIndex + 1 >= parts.length) {
    return null;
  }

  const extensionFolderName = parts[extensionsIndex + 1];
  const settingsPath = path.join(
    parts.slice(0, extensionsIndex).join(path.sep),
    "Claude Extensions Settings",
    `${extensionFolderName}.json`,
  );

  if (!fs.existsSync(settingsPath)) {
    return null;
  }

  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    return settings?.userConfig?.context_root ?? null;
  } catch {
    return null;
  }
}

function discoverLocalContextRoot() {
  const candidates = [
    path.resolve(serverDir, "..", "personal-context-portfolio"),
    path.resolve(serverDir, "..", "..", "personal-context-portfolio"),
    path.resolve(process.cwd(), "personal-context-portfolio"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function determineContextRoot() {
  const configuredRoot =
    process.env.PERSONAL_CONTEXT_ROOT ?? readExtensionConfiguredContextRoot();

  if (configuredRoot) {
    return path.resolve(configuredRoot);
  }

  const discoveredRoot = discoverLocalContextRoot();
  if (discoveredRoot) {
    return discoveredRoot;
  }

  throw new Error(
    "Could not determine the personal context root. Set PERSONAL_CONTEXT_ROOT or configure the extension folder path.",
  );
}

const contextRoot = determineContextRoot();

if (!fs.existsSync(contextRoot)) {
  throw new Error(
    `Personal context root does not exist: ${contextRoot}. Choose the personal-context-portfolio folder in the extension settings.`,
  );
}

const roots = {
  core: path.join(contextRoot, "core"),
  dynamic: path.join(contextRoot, "dynamic"),
  inbox: path.join(contextRoot, "inbox"),
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureDefaultFile(kind, fileName, content) {
  const filePath = path.join(roots[kind], fileName);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content, "utf8");
  }
}

function ensurePortfolioScaffold() {
  ensureDir(roots.core);
  ensureDir(roots.dynamic);
  ensureDir(roots.inbox);

  for (const [kind, files] of Object.entries(DEFAULT_FILE_CONTENTS)) {
    for (const [fileName, content] of Object.entries(files)) {
      ensureDefaultFile(kind, fileName, content);
    }
  }
}

ensurePortfolioScaffold();
debugLog(`contextRoot=${contextRoot}`);

function listMarkdownFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
}

function slugToTitle(slug) {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseRelativePath(relativePath) {
  if (!/^(core|dynamic|inbox)\/[A-Za-z0-9._-]+\.md$/.test(relativePath)) {
    throw new Error(
      "relative_path must look like core/file.md, dynamic/file.md, or inbox/file.md.",
    );
  }

  const [kind, fileName] = relativePath.split("/");
  return { kind, fileName };
}

function resolveFilePath(kind, fileName) {
  const root = roots[kind];
  const resolved = path.resolve(root, fileName);
  if (!resolved.startsWith(root + path.sep)) {
    throw new Error("Resolved path escapes the allowed root");
  }
  return resolved;
}

function buildResourceUri(kind, fileName) {
  return `context://${kind}/${fileName}`;
}

function memoryFileLines() {
  const groups = [
    ["Core files:", "core"],
    ["Dynamic files:", "dynamic"],
    ["Inbox files:", "inbox"],
  ];

  const lines = [];
  for (const [heading, kind] of groups) {
    lines.push(heading);
    for (const fileName of listMarkdownFiles(roots[kind])) {
      lines.push(`- ${kind}/${fileName}`);
    }
  }
  return lines;
}

function memoryFileSummary() {
  return memoryFileLines().join("\n");
}

function removeDefaultPlaceholder(existingText, placeholders) {
  let updated = existingText;
  for (const placeholder of placeholders) {
    updated = updated.replace(`${placeholder}\n`, "");
  }
  return updated;
}

function replaceMarkdownSection(markdown, heading, replacementBody) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionPattern = new RegExp(
    `(${escapedHeading}\\n)([\\s\\S]*?)(?=\\n## |\\n# |$)`,
    "m",
  );

  if (!sectionPattern.test(markdown)) {
    throw new Error(`Section not found: ${heading}`);
  }

  const normalizedBody = replacementBody.trim().length > 0 ? replacementBody.trim() : "- None";
  return markdown.replace(sectionPattern, `$1${normalizedBody}\n`);
}

function insertIntoSection(markdown, heading, block) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionPattern = new RegExp(
    `(${escapedHeading}\\n)([\\s\\S]*?)(?=\\n## |\\n# |$)`,
    "m",
  );

  if (!sectionPattern.test(markdown)) {
    throw new Error(`Section not found: ${heading}`);
  }

  return markdown.replace(sectionPattern, (_match, prefix, body) => {
    const trimmedBody = body.trim();
    if (trimmedBody.length > 0) {
      return `${prefix}${trimmedBody}\n\n${block}\n`;
    }
    return `${prefix}\n${block}\n`;
  });
}

function overwriteDynamicSection(file, sectionHeading, content) {
  const allowedSections = SECTION_REWRITE_ALLOWLIST.get(file);
  if (!allowedSections || !allowedSections.has(sectionHeading)) {
    throw new Error(`Section rewrite is not allowed for ${file}: ${sectionHeading}`);
  }

  const filePath = resolveFilePath("dynamic", `${file}.md`);
  const existing = fs.readFileSync(filePath, "utf8");
  const updated = replaceMarkdownSection(existing, sectionHeading, content);
  fs.writeFileSync(filePath, updated, "utf8");
}

function appendMemoryEntry(args) {
  const {
    file,
    title,
    summary,
    bullets = [],
    source = "",
    evidence_links = [],
    tags = [],
  } = args;

  if (!WRITABLE_FILE_NAMES.has(file)) {
    throw new Error(`File is not writable through this tool: ${file}`);
  }

  const kind = DYNAMIC_FILE_NAMES.includes(file) ? "dynamic" : "inbox";
  const fileName = `${file}.md`;
  const filePath = resolveFilePath(kind, fileName);
  const existingText = fs.readFileSync(filePath, "utf8");
  const cleaned = removeDefaultPlaceholder(existingText, [
    "- No live priorities recorded yet.",
    "- No active campaigns recorded yet.",
    "- No learnings recorded yet.",
    "- No message tests recorded yet.",
    "- No account patterns recorded yet.",
    "- No raw notes recorded yet.",
    "- No core update proposals recorded yet.",
  ]);

  const timestamp = new Date().toISOString();
  const lines = [`## ${timestamp} - ${title}`, `- Summary: ${summary}`];

  for (const bullet of bullets) {
    lines.push(`- ${bullet}`);
  }

  if (source) {
    lines.push(`- Source: ${source}`);
  }

  if (evidence_links.length > 0) {
    lines.push(`- Evidence: ${evidence_links.join(", ")}`);
  }

  if (tags.length > 0) {
    lines.push(`- Tags: ${tags.join(", ")}`);
  }

  const entry = lines.join("\n");
  const targetSection = APPEND_TARGET_SECTIONS.get(file);
  const nextText = targetSection
    ? insertIntoSection(cleaned, targetSection, entry)
    : `${cleaned.trimEnd()}\n\n${entry}\n`;

  fs.writeFileSync(filePath, nextText, "utf8");
  return `Appended memory entry to ${kind}/${fileName}.`;
}

function replaceDynamicSection(args) {
  const { file, section_heading, content } = args;

  if (!DYNAMIC_FILE_NAMES.includes(file)) {
    throw new Error(`Section replacement is only allowed for dynamic files: ${file}`);
  }

  overwriteDynamicSection(file, section_heading, content);
  return `Replaced ${section_heading} in dynamic/${file}.md.`;
}

function bootstrapDynamicMemory(args) {
  const {
    current_priorities = [],
    active_campaigns = [],
    recent_learnings = [],
    message_tests = [],
    account_patterns = [],
  } = args;

  const toBullets = (items, emptyFallback) =>
    items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : emptyFallback;

  overwriteDynamicSection(
    "current-priorities",
    "## Active Priorities",
    toBullets(current_priorities, "- No live priorities recorded yet."),
  );
  overwriteDynamicSection(
    "active-campaigns",
    "## Campaigns",
    toBullets(active_campaigns, "- No active campaigns recorded yet."),
  );
  overwriteDynamicSection(
    "recent-learnings",
    "## Learnings",
    toBullets(recent_learnings, "- No learnings recorded yet."),
  );
  overwriteDynamicSection(
    "message-tests",
    "## Tests",
    toBullets(message_tests, "- No message tests recorded yet."),
  );
  overwriteDynamicSection(
    "account-patterns",
    "## Patterns",
    toBullets(account_patterns, "- No account patterns recorded yet."),
  );

  return "Bootstrapped dynamic memory files with the provided installation-time context.";
}

function proposeCoreUpdate(args) {
  const { target_file, rationale, proposed_changes } = args;
  const allowedCoreFiles = new Set([
    "identity",
    "product-and-positioning",
    "communication-style",
    "outbound-playbook",
    "agent-rules",
  ]);

  if (!allowedCoreFiles.has(target_file)) {
    throw new Error(`Unsupported core file: ${target_file}`);
  }

  return appendMemoryEntry({
    file: "core-update-proposals",
    title: target_file,
    summary: rationale,
    bullets: ["Proposed changes:", proposed_changes.trim()],
  }).replace("core-update-proposals.md", "core-update-proposals.md");
}

function readMemoryFile(relativePath) {
  const { kind, fileName } = parseRelativePath(relativePath);
  const filePath = resolveFilePath(kind, fileName);
  const text = fs.readFileSync(filePath, "utf8");

  return {
    relativePath: `${kind}/${fileName}`,
    text,
  };
}

function registerResources(server) {
  for (const kind of ["core", "dynamic", "inbox"]) {
    for (const fileName of listMarkdownFiles(roots[kind])) {
      const slug = fileName.replace(/\.md$/, "");
      const uri = buildResourceUri(kind, fileName);
      server.registerResource(
        `${kind}-${slug}`,
        uri,
        {
          title: `${kind}: ${slugToTitle(slug)}`,
          description:
            kind === "core"
              ? "Durable personal context file"
              : kind === "dynamic"
                ? "Working-memory file that can be updated over time"
                : "Inbox file for rough notes and proposed core updates",
          mimeType: "text/markdown",
        },
        async () => ({
          contents: [
            {
              uri,
              mimeType: "text/markdown",
              text: fs.readFileSync(resolveFilePath(kind, fileName), "utf8"),
            },
          ],
        }),
      );
    }
  }
}

function textResult(text) {
  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}

const server = new McpServer(
  {
    name: "personal-context",
    version: "0.2.0",
  },
  {
    instructions:
      "Use core files as durable source of truth. Write new learnings, campaign updates, and rough notes only to dynamic or inbox files. Do not edit core files directly; propose core changes through inbox/core-update-proposals.md.",
  },
);

registerResources(server);

server.registerTool(
  "list_memory_files",
  {
    description:
      "List the available core, dynamic, and inbox markdown files in the personal context portfolio.",
    inputSchema: {},
  },
  async () => textResult(memoryFileSummary()),
);

server.registerTool(
  "read_memory_file",
  {
    description:
      "Read one markdown file from the personal context portfolio. Use a relative path like core/product-and-positioning.md or dynamic/recent-learnings.md.",
    inputSchema: {
      relative_path: z
        .string()
        .regex(/^(core|dynamic|inbox)\/[A-Za-z0-9._-]+\.md$/)
        .describe("Relative path like core/product-and-positioning.md"),
    },
  },
  async ({ relative_path }) => {
    const { relativePath, text } = readMemoryFile(relative_path);
    return textResult(`# ${relativePath}\n\n${text}`);
  },
);

server.registerTool(
  "append_memory_entry",
  {
    description:
      "Append a dated memory entry to an allowed dynamic or inbox file. Use this for durable learnings, campaign changes, message tests, and rough notes.",
    inputSchema: {
      file: z.enum([
        "current-priorities",
        "active-campaigns",
        "recent-learnings",
        "message-tests",
        "account-patterns",
        "raw-notes",
        "core-update-proposals",
      ]),
      title: z.string(),
      summary: z.string(),
      bullets: z.array(z.string()).optional(),
      source: z.string().optional(),
      evidence_links: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
    },
  },
  async (args) => textResult(appendMemoryEntry(args)),
);

server.registerTool(
  "replace_dynamic_section",
  {
    description:
      "Replace an allowed top-level section in a dynamic markdown file. Use this when current priorities or campaign summaries need a clean rewrite.",
    inputSchema: {
      file: z.enum([
        "current-priorities",
        "active-campaigns",
        "recent-learnings",
        "message-tests",
        "account-patterns",
      ]),
      section_heading: z.string(),
      content: z.string(),
    },
  },
  async (args) => textResult(replaceDynamicSection(args)),
);

server.registerTool(
  "bootstrap_dynamic_memory",
  {
    description:
      "Seed the dynamic memory files in one batch during installation or onboarding.",
    inputSchema: {
      current_priorities: z.array(z.string()).optional(),
      active_campaigns: z.array(z.string()).optional(),
      recent_learnings: z.array(z.string()).optional(),
      message_tests: z.array(z.string()).optional(),
      account_patterns: z.array(z.string()).optional(),
    },
  },
  async (args) => textResult(bootstrapDynamicMemory(args)),
);

server.registerTool(
  "propose_core_update",
  {
    description:
      "Write a proposed update for a protected core file into the inbox instead of editing the core file directly.",
    inputSchema: {
      target_file: z.enum([
        "identity",
        "product-and-positioning",
        "communication-style",
        "outbound-playbook",
        "agent-rules",
      ]),
      rationale: z.string(),
      proposed_changes: z.string(),
    },
  },
  async (args) => textResult(proposeCoreUpdate(args)),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  debugLog("SDK server connected");
}

main().catch((error) => {
  console.error("[personal-context] Server error:", error);
  process.exit(1);
});
