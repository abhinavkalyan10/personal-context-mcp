import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod";

const DYNAMIC_FILE_NAMES = [
  "current-priorities",
  "active-campaigns",
  "recent-learnings",
  "message-tests",
  "account-patterns",
];

const INBOX_FILE_NAMES = ["raw-notes", "core-update-proposals"];

const WRITABLE_FILE_NAMES = new Set([...DYNAMIC_FILE_NAMES, ...INBOX_FILE_NAMES]);

const APPEND_TARGET_SECTIONS = new Map([
  ["current-priorities", "## Active Priorities"],
  ["active-campaigns", "## Campaigns"],
  ["recent-learnings", "## Learnings"],
  ["message-tests", "## Tests"],
  ["account-patterns", "## Patterns"],
  ["raw-notes", "## Notes"],
  ["core-update-proposals", "## Proposed Updates"],
]);

const CONTEXT_ROOT_FOLDER_NAMES = [
  "personal-context-portfolio",
  "my-personal-context-portfolio",
];

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

const MEMORY_KINDS = ["core", "dynamic", "inbox"];

const ALLOWED_CORE_FILES = new Set([
  "identity",
  "product-and-positioning",
  "communication-style",
  "outbound-playbook",
  "agent-rules",
]);

const TOOL_NAMES = [
  "status",
  "list_memory_files",
  "read_memory_file",
  "search_memory",
  "wake_up_context",
  "append_memory_entry",
  "replace_dynamic_section",
  "bootstrap_dynamic_memory",
  "propose_core_update",
];

const SEARCH_MODE = "markdown-scan-v1";

const SERVER_VERSION = "0.3.0";

const SERVER_INSTRUCTIONS =
  "Use core files as durable source of truth. Write new learnings, campaign updates, and rough notes only to dynamic or inbox files. Do not edit core files directly; propose core changes through inbox/core-update-proposals.md.";

const LOW_SIGNAL_SECTION_TITLES = new Set([
  "Purpose",
  "Suggested Entry Format",
  "Entry Guidance",
]);

const WAKE_UP_CONTEXT_DEFAULT_MAX_ITEMS = 6;
const WAKE_UP_CONTEXT_MAX_ITEMS = 8;
const WAKE_UP_CONTEXT_MAX_NEXT_READS = 3;
const WAKE_UP_CONTEXT_MAX_INBOX_ITEMS = 1;

const WAKE_UP_CONTEXT_TRUST_RULES = {
  core: {
    trust_level: "high",
    trust_bonus: 8,
  },
  dynamic: {
    trust_level: "medium",
    trust_bonus: 2,
  },
  inbox: {
    trust_level: "low",
    trust_bonus: -8,
  },
};

const WAKE_UP_CONTEXT_WARNING_MESSAGES = {
  NO_MATCHES: "No eligible matches were found in the allowed memory kinds.",
  ONLY_INBOX_MATCHES_EXCLUDED:
    "Only inbox matches were found, but inbox was not requested.",
  LOW_TRUST_ONLY:
    "Only inbox matches were available, so the bundle fell back to low-trust context.",
  SPARSE_RESULTS: "Fewer eligible items were available than requested.",
  SINGLE_FILE_BUNDLE: "All selected items came from the same file.",
  CANDIDATE_POOL_TRUNCATED: "The search candidate pool hit the configured limit.",
  PARTIAL_RESULTS: "Some candidates became unusable during bundle assembly.",
};

const WAKE_UP_CONTEXT_REASON_CODE_ORDER = [
  "anchor",
  "trust_bonus",
  "kind_complement",
  "inbox_opt_in",
  "low_trust_only_fallback",
  "diversity_preserved",
];

const WAKE_UP_CONTEXT_NEXT_READ_PRIORITY = {
  same_file_cap: 0,
  inbox_not_requested: 1,
  inbox_low_trust: 1,
  lower_adjusted_score: 2,
  path_only_candidate: 3,
};

function createDebugLogger(debugEnabled) {
  return function debugLog(message) {
    if (debugEnabled) {
      process.stderr.write(`[personal-context] ${message}\n`);
    }
  };
}

function readExtensionConfiguredContextRoot(serverDir) {
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

function discoverLocalContextRoot(serverDir) {
  const candidateBases = [
    path.resolve(serverDir, ".."),
    path.resolve(serverDir, "..", ".."),
    path.resolve(process.cwd()),
  ];

  for (const baseDir of candidateBases) {
    for (const folderName of CONTEXT_ROOT_FOLDER_NAMES) {
      const candidate = path.resolve(baseDir, folderName);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function determineContextRoot(serverDir, env) {
  const configuredRoot =
    env.PERSONAL_CONTEXT_ROOT ?? readExtensionConfiguredContextRoot(serverDir);

  if (configuredRoot) {
    return path.resolve(configuredRoot);
  }

  const discoveredRoot = discoverLocalContextRoot(serverDir);
  if (discoveredRoot) {
    return discoveredRoot;
  }

  throw new Error(
    "Could not determine the personal context root. Set PERSONAL_CONTEXT_ROOT or configure the extension folder path.",
  );
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureDefaultFile(roots, kind, fileName, content) {
  const filePath = path.join(roots[kind], fileName);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content, "utf8");
  }
}

function ensurePortfolioScaffold(roots) {
  ensureDir(roots.core);
  ensureDir(roots.dynamic);
  ensureDir(roots.inbox);

  for (const [kind, files] of Object.entries(DEFAULT_FILE_CONTENTS)) {
    for (const [fileName, content] of Object.entries(files)) {
      ensureDefaultFile(roots, kind, fileName, content);
    }
  }
}

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

function resolveFilePath(roots, kind, fileName) {
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

function memoryFileLines(roots) {
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

function memoryFileSummary(roots) {
  return memoryFileLines(roots).join("\n");
}

function listRelativeMarkdownFiles(roots, kind) {
  return listMarkdownFiles(roots[kind]).map((fileName) => `${kind}/${fileName}`);
}

function memoryFileRecords(roots) {
  const records = [];

  for (const kind of MEMORY_KINDS) {
    for (const fileName of listMarkdownFiles(roots[kind])) {
      records.push({
        kind,
        fileName,
        relativePath: `${kind}/${fileName}`,
        absolutePath: resolveFilePath(roots, kind, fileName),
      });
    }
  }

  return records;
}

function removeDefaultPlaceholder(existingText, placeholders) {
  let updated = existingText;
  for (const placeholder of placeholders) {
    updated = updated.replace(`${placeholder}\n`, "");
  }
  return updated;
}

function trimBlankLines(lines) {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start].trim().length === 0) {
    start += 1;
  }

  while (end > start && lines[end - 1].trim().length === 0) {
    end -= 1;
  }

  return lines.slice(start, end);
}

function findSectionBounds(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line === heading);

  if (headingIndex === -1) {
    throw new Error(`Section not found: ${heading}`);
  }

  const headingMatch = heading.match(/^(#+)\s/);
  if (!headingMatch) {
    throw new Error(`Invalid heading: ${heading}`);
  }

  const headingLevel = headingMatch[1].length;
  let sectionEndIndex = lines.length;

  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#+)\s/);
    if (match && match[1].length <= headingLevel) {
      sectionEndIndex = index;
      break;
    }
  }

  return {
    lines,
    headingIndex,
    sectionEndIndex,
    lineEnding: markdown.includes("\r\n") ? "\r\n" : "\n",
    hasTrailingNewline: markdown.endsWith("\n"),
  };
}

function rebuildMarkdown(lines, lineEnding, hasTrailingNewline) {
  const rebuilt = lines.join(lineEnding);
  return hasTrailingNewline ? `${rebuilt}${lineEnding}` : rebuilt;
}

function replaceMarkdownSection(markdown, heading, replacementBody) {
  const normalizedBody = replacementBody.trim().length > 0 ? replacementBody.trim() : "- None";
  const replacementLines = trimBlankLines(normalizedBody.split(/\r?\n/));
  const { lines, headingIndex, sectionEndIndex, lineEnding, hasTrailingNewline } =
    findSectionBounds(markdown, heading);

  const nextLines = [
    ...lines.slice(0, headingIndex + 1),
    ...replacementLines,
  ];

  if (sectionEndIndex < lines.length && nextLines[nextLines.length - 1] !== "") {
    nextLines.push("");
  }

  nextLines.push(...lines.slice(sectionEndIndex));

  return rebuildMarkdown(nextLines, lineEnding, hasTrailingNewline);
}

function insertIntoSection(markdown, heading, block) {
  const blockLines = trimBlankLines(block.split(/\r?\n/));
  const { lines, headingIndex, sectionEndIndex, lineEnding, hasTrailingNewline } =
    findSectionBounds(markdown, heading);
  const existingBodyLines = trimBlankLines(lines.slice(headingIndex + 1, sectionEndIndex));
  const nextBodyLines =
    existingBodyLines.length > 0
      ? [...existingBodyLines, "", ...blockLines]
      : blockLines;
  const nextLines = [
    ...lines.slice(0, headingIndex + 1),
    ...nextBodyLines,
  ];

  if (sectionEndIndex < lines.length && nextLines[nextLines.length - 1] !== "") {
    nextLines.push("");
  }

  nextLines.push(...lines.slice(sectionEndIndex));

  return rebuildMarkdown(nextLines, lineEnding, hasTrailingNewline);
}

function overwriteDynamicSection(roots, file, sectionHeading, content) {
  const allowedSections = listReplaceableDynamicSections(roots, file);
  if (!allowedSections.includes(sectionHeading)) {
    throw new Error(`Section rewrite is not allowed for ${file}: ${sectionHeading}`);
  }

  const filePath = resolveFilePath(roots, "dynamic", `${file}.md`);
  const existing = fs.readFileSync(filePath, "utf8");
  const updated = replaceMarkdownSection(existing, sectionHeading, content);
  fs.writeFileSync(filePath, updated, "utf8");
}

function appendMemoryEntry(roots, args) {
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
  const filePath = resolveFilePath(roots, kind, fileName);
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
  const lines = [`### ${timestamp} - ${title}`, `- Summary: ${summary}`];

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

function replaceDynamicSection(roots, args) {
  const { file, section_heading, content } = args;

  if (!DYNAMIC_FILE_NAMES.includes(file)) {
    throw new Error(`Section replacement is only allowed for dynamic files: ${file}`);
  }

  overwriteDynamicSection(roots, file, section_heading, content);
  return `Replaced ${section_heading} in dynamic/${file}.md.`;
}

function bootstrapDynamicMemory(roots, args) {
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
    roots,
    "current-priorities",
    "## Active Priorities",
    toBullets(current_priorities, "- No live priorities recorded yet."),
  );
  overwriteDynamicSection(
    roots,
    "active-campaigns",
    "## Campaigns",
    toBullets(active_campaigns, "- No active campaigns recorded yet."),
  );
  overwriteDynamicSection(
    roots,
    "recent-learnings",
    "## Learnings",
    toBullets(recent_learnings, "- No learnings recorded yet."),
  );
  overwriteDynamicSection(
    roots,
    "message-tests",
    "## Tests",
    toBullets(message_tests, "- No message tests recorded yet."),
  );
  overwriteDynamicSection(
    roots,
    "account-patterns",
    "## Patterns",
    toBullets(account_patterns, "- No account patterns recorded yet."),
  );

  return "Bootstrapped dynamic memory files with the provided installation-time context.";
}

function proposeCoreUpdate(roots, args) {
  const { target_file, rationale, proposed_changes } = args;

  if (!ALLOWED_CORE_FILES.has(target_file)) {
    throw new Error(`Unsupported core file: ${target_file}`);
  }

  return appendMemoryEntry(roots, {
    file: "core-update-proposals",
    title: target_file,
    summary: rationale,
    bullets: ["Proposed changes:", proposed_changes.trim()],
  });
}

function readMemoryFile(roots, relativePath) {
  const { kind, fileName } = parseRelativePath(relativePath);
  const filePath = resolveFilePath(roots, kind, fileName);
  const text = fs.readFileSync(filePath, "utf8");

  return {
    relativePath: `${kind}/${fileName}`,
    text,
  };
}

function collapseWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function trimSnippet(text, maxLength = 220) {
  const normalized = collapseWhitespace(text);

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function listReplaceableDynamicSections(roots, file) {
  const filePath = resolveFilePath(roots, "dynamic", `${file}.md`);
  const markdown = fs.readFileSync(filePath, "utf8");

  return markdown
    .split(/\r?\n/)
    .filter((line) => /^##\s+/.test(line))
    .map((line) => line.trim())
    .filter((heading) => heading !== "## Purpose");
}

function buildStatusReport(contextRoot, roots) {
  const filesByKind = Object.fromEntries(
    MEMORY_KINDS.map((kind) => [kind, listRelativeMarkdownFiles(roots, kind)]),
  );
  const fileCounts = Object.fromEntries(
    MEMORY_KINDS.map((kind) => [kind, filesByKind[kind].length]),
  );
  const writableFiles = Array.from(WRITABLE_FILE_NAMES)
    .sort()
    .map((file) =>
      DYNAMIC_FILE_NAMES.includes(file)
        ? `dynamic/${file}.md`
        : `inbox/${file}.md`,
    );
  const replaceableSections = DYNAMIC_FILE_NAMES.map((file) => ({
      relativePath: `dynamic/${file}.md`,
      sections: listReplaceableDynamicSections(roots, file),
    }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  return {
    contextRoot,
    filesByKind,
    fileCounts,
    writableFiles,
    replaceableSections,
    toolNames: [...TOOL_NAMES],
    retrieval: {
      mode: SEARCH_MODE,
      derivedIndexEnabled: false,
    },
  };
}

function formatStatusReport(report) {
  const lines = [
    "# Personal Context Status",
    `- Context root: ${report.contextRoot}`,
    `- Search mode: ${report.retrieval.mode}`,
    `- Derived index enabled: ${report.retrieval.derivedIndexEnabled ? "yes" : "no"}`,
    "",
    "## File Counts",
    `- Core: ${report.fileCounts.core}`,
    `- Dynamic: ${report.fileCounts.dynamic}`,
    `- Inbox: ${report.fileCounts.inbox}`,
    "",
    "## Files",
  ];

  for (const kind of MEMORY_KINDS) {
    lines.push(`${kind.charAt(0).toUpperCase() + kind.slice(1)}:`);
    if (report.filesByKind[kind].length === 0) {
      lines.push("- None yet");
      continue;
    }

    for (const relativePath of report.filesByKind[kind]) {
      lines.push(`- ${relativePath}`);
    }
  }

  lines.push("", "## Writable Files");
  for (const relativePath of report.writableFiles) {
    lines.push(`- ${relativePath}`);
  }

  lines.push("", "## Replaceable Dynamic Sections");
  for (const item of report.replaceableSections) {
    lines.push(`- ${item.relativePath}: ${item.sections.join(", ")}`);
  }

  lines.push("", "## Available Tools");
  for (const toolName of report.toolNames) {
    lines.push(`- ${toolName}`);
  }

  return lines.join("\n");
}

function tokenizeSearchQuery(query) {
  return Array.from(
    new Set(
      (query.toLowerCase().match(/[A-Za-z0-9][A-Za-z0-9._-]*/g) ?? []).filter(
        (term) => term.length >= 2,
      ),
    ),
  );
}

function textContainsSearchTerm(text, term) {
  if (term.length <= 3) {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}(?=$|[^a-z0-9])`);
    return pattern.test(text);
  }

  return text.includes(term);
}

function normalizeDisplayHeading(heading) {
  const entryHeadingMatch = heading.match(
    /^\d{4}-\d{2}-\d{2}T[0-9:.+-]+Z?\s+-\s+(.*)$/,
  );

  if (entryHeadingMatch) {
    return entryHeadingMatch[1].trim();
  }

  return heading;
}

function formatSectionPath(headingPath) {
  return headingPath.length > 0
    ? headingPath.map(normalizeDisplayHeading).join(" / ")
    : "Document";
}

function isLowSignalHeadingPath(headingPath) {
  const heading = headingPath.at(-1);
  return heading ? LOW_SIGNAL_SECTION_TITLES.has(heading) : false;
}

function isPlaceholderLine(line) {
  return /^-\s+No .+ recorded yet\.$/i.test(line.trim());
}

function isTemplateLine(line) {
  return /^-\s+[A-Za-z][A-Za-z0-9/&(),'"'\s-]{0,80}:\s*$/.test(line.trim());
}

function isLowSignalLine(line) {
  return isPlaceholderLine(line) || isTemplateLine(line);
}

function parseMarkdownBlocks(markdown, relativePath) {
  const lines = markdown.split(/\r?\n/);
  const firstNonBlankLine =
    lines.find((line) => line.trim().length > 0)?.trim() ?? relativePath;
  const blocks = [
    {
      kind: "metadata",
      headingPath: [],
      lines: [relativePath, firstNonBlankLine],
      text: `${relativePath}\n${firstNonBlankLine}`,
    },
  ];
  const headingPath = [];
  let currentLines = [];

  const flushContent = () => {
    const trimmedLines = trimBlankLines(currentLines.map((line) => line.trim()));
    if (trimmedLines.length === 0) {
      currentLines = [];
      return;
    }

    blocks.push({
      kind: "content",
      headingPath: headingPath.filter(Boolean),
      lines: trimmedLines,
      text: trimmedLines.join("\n"),
    });
    currentLines = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushContent();
      const level = headingMatch[1].length;
      const headingTitle = headingMatch[2].trim();

      headingPath.splice(level - 1);
      headingPath[level - 1] = headingTitle;
      blocks.push({
        kind: "heading",
        headingPath: headingPath.filter(Boolean),
        lines: [headingTitle],
        text: headingPath.filter(Boolean).join(" / "),
      });
      continue;
    }

    if (line.trim().length === 0) {
      flushContent();
      continue;
    }

    currentLines.push(line);
  }

  flushContent();

  return blocks;
}

function scoreSearchBlock(relativePath, block, phrase, terms) {
  const pathText = relativePath.toLowerCase();
  const headingText = formatSectionPath(block.headingPath).toLowerCase();
  const blockText =
    block.kind === "heading"
      ? headingText
      : block.kind === "metadata"
        ? (block.lines.at(-1) ?? "").toLowerCase()
        : block.text.toLowerCase();
  const isLowSignalSection = isLowSignalHeadingPath(block.headingPath);
  const isTimestampedEntryHeading =
    block.kind === "heading" &&
    typeof block.headingPath.at(-1) === "string" &&
    normalizeDisplayHeading(block.headingPath.at(-1)) !== block.headingPath.at(-1);
  const allLinesLowSignal =
    block.kind === "content" &&
    block.lines.length > 0 &&
    block.lines.every((line) => isLowSignalLine(line));
  const matchedTerms = new Set();
  const matchedIn = new Set();
  let score = 0;

  if (phrase && pathText.includes(phrase)) {
    score += 10;
    matchedIn.add("path");
  }

  if (phrase && headingText.includes(phrase)) {
    score += 18;
    matchedIn.add("heading");
  }

  if (phrase && blockText.includes(phrase)) {
    score += block.kind === "content" ? 26 : 20;
    matchedIn.add(block.kind === "content" ? "content" : "heading");
  }

  for (const term of terms) {
    let seenTerm = false;

    if (textContainsSearchTerm(pathText, term)) {
      score += 2;
      matchedIn.add("path");
      seenTerm = true;
    }

    if (textContainsSearchTerm(headingText, term)) {
      score += 6;
      matchedIn.add("heading");
      seenTerm = true;
    }

    if (textContainsSearchTerm(blockText, term)) {
      score += block.kind === "content" ? 5 : 4;
      matchedIn.add(block.kind === "content" ? "content" : "heading");
      seenTerm = true;
    }

    if (seenTerm) {
      matchedTerms.add(term);
    }
  }

  if (terms.length > 1 && matchedTerms.size === terms.length) {
    score += 8;
  }

  if (block.kind === "metadata" && matchedIn.size === 1 && matchedIn.has("path")) {
    score = Math.max(score - 3, 1);
  }

  if (isLowSignalSection) {
    score -= block.kind === "content" ? 6 : 8;
  }

  if (allLinesLowSignal) {
    score -= 8;
  }

  if (isTimestampedEntryHeading) {
    score -= 3;
  }

  return {
    score: Math.max(score, 0),
    matchedTerms: Array.from(matchedTerms),
    matchedIn: Array.from(matchedIn).sort(),
  };
}

function pickSnippetLine(lines, phrase, terms) {
  let bestLine = lines[0] ?? "";
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const rawLine of lines) {
    const line = collapseWhitespace(rawLine);
    if (!line) {
      continue;
    }

    const normalizedLine = line.toLowerCase();
    let score = 0;

    if (phrase && normalizedLine.includes(phrase)) {
      score += 12;
    }

    for (const term of terms) {
      if (normalizedLine.includes(term)) {
        score += 3;
      }
    }

    if (score > bestScore || (score === bestScore && line.length < bestLine.length)) {
      bestScore = score;
      bestLine = line;
    }
  }

  return bestLine;
}

function buildSearchSnippet(relativePath, block, phrase, terms) {
  if (block.kind === "metadata") {
    return `File match: ${relativePath}`;
  }

  if (block.kind === "heading") {
    return `Section match: ${formatSectionPath(block.headingPath)}`;
  }

  return trimSnippet(pickSnippetLine(block.lines, phrase, terms));
}

function shouldReplaceSearchResult(existing, candidate) {
  if (!existing) {
    return true;
  }

  if (candidate.score !== existing.score) {
    return candidate.score > existing.score;
  }

  const existingHasContent = existing.matchedIn.includes("content");
  const candidateHasContent = candidate.matchedIn.includes("content");
  if (candidateHasContent !== existingHasContent) {
    return candidateHasContent;
  }

  const existingHeadingOnly = existing.snippet.startsWith("Section match:");
  const candidateHeadingOnly = candidate.snippet.startsWith("Section match:");
  if (candidateHeadingOnly !== existingHeadingOnly) {
    return !candidateHeadingOnly;
  }

  return candidate.snippet.length < existing.snippet.length;
}

function findMemoryMatches(
  roots,
  {
    query,
    kinds = MEMORY_KINDS,
    relative_paths = [],
    max_results = 8,
  },
) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    throw new Error("query must not be empty");
  }

  const normalizedKinds = new Set(kinds);
  const relativePathsSet =
    relative_paths.length > 0 ? new Set(relative_paths) : null;
  const phrase = normalizedQuery.toLowerCase();
  const terms = tokenizeSearchQuery(normalizedQuery);
  const sectionMatches = new Map();

  for (const record of memoryFileRecords(roots)) {
    if (!normalizedKinds.has(record.kind)) {
      continue;
    }

    if (relativePathsSet && !relativePathsSet.has(record.relativePath)) {
      continue;
    }

    const markdown = fs.readFileSync(record.absolutePath, "utf8");

    for (const block of parseMarkdownBlocks(markdown, record.relativePath)) {
      const scored = scoreSearchBlock(record.relativePath, block, phrase, terms);
      if (scored.score <= 0) {
        continue;
      }

      const sectionPath = formatSectionPath(block.headingPath);
      const result = {
        relativePath: record.relativePath,
        kind: record.kind,
        section:
          block.headingPath.length > 0
            ? normalizeDisplayHeading(block.headingPath.at(-1))
            : "Document",
        sectionPath,
        score: scored.score,
        matchedIn: scored.matchedIn,
        matchedTerms: scored.matchedTerms,
        snippet: buildSearchSnippet(record.relativePath, block, phrase, terms),
      };
      const resultKey = `${record.relativePath}::${sectionPath}`;
      const existing = sectionMatches.get(resultKey);

      if (shouldReplaceSearchResult(existing, result)) {
        sectionMatches.set(resultKey, result);
      }
    }
  }

  const sortedResults = Array.from(sectionMatches.values()).sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    const pathOrder = left.relativePath.localeCompare(right.relativePath);
    if (pathOrder !== 0) {
      return pathOrder;
    }

    return left.sectionPath.localeCompare(right.sectionPath);
  });
  const limit = Math.max(1, Math.min(max_results, 20));

  return {
    query: normalizedQuery,
    totalMatches: sortedResults.length,
    truncated: sortedResults.length > limit,
    appliedFilters: {
      kinds: Array.from(normalizedKinds).sort(),
      relativePaths: relativePathsSet ? Array.from(relativePathsSet).sort() : [],
    },
    results: sortedResults.slice(0, limit),
  };
}

function formatSearchResults(report) {
  const lines = [
    `# Search Results for "${report.query}"`,
    `- Search mode: ${SEARCH_MODE}`,
    `- Matches: ${report.totalMatches}`,
  ];

  if (report.appliedFilters.kinds.length !== MEMORY_KINDS.length) {
    lines.push(`- Kinds: ${report.appliedFilters.kinds.join(", ")}`);
  }

  if (report.appliedFilters.relativePaths.length > 0) {
    lines.push(`- Paths: ${report.appliedFilters.relativePaths.join(", ")}`);
  }

  if (report.results.length === 0) {
    lines.push("", "No matches found.");
    return lines.join("\n");
  }

  report.results.forEach((result, index) => {
    lines.push(
      "",
      `${index + 1}. ${result.relativePath}`,
      `- Section: ${result.sectionPath}`,
      `- Matched in: ${result.matchedIn.join(", ") || "content"}`,
      `- Score: ${result.score}`,
      `- Snippet: ${result.snippet}`,
    );
  });

  if (report.truncated) {
    lines.push("", `Showing top ${report.results.length} results.`);
  }

  return lines.join("\n");
}

function normalizeOptionalWakeUpText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = collapseWhitespace(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeWakeUpContextArgs(args) {
  const normalizedArgs =
    args && typeof args === "object" && !Array.isArray(args) ? args : {};
  const task = normalizeOptionalWakeUpText(normalizedArgs.task);

  if (!task) {
    throw new Error("task is required");
  }

  const project = normalizeOptionalWakeUpText(normalizedArgs.project);
  const goal = normalizeOptionalWakeUpText(normalizedArgs.goal);

  let maxItems = WAKE_UP_CONTEXT_DEFAULT_MAX_ITEMS;
  if (normalizedArgs.max_items != null) {
    if (
      !Number.isInteger(normalizedArgs.max_items) ||
      normalizedArgs.max_items < 1 ||
      normalizedArgs.max_items > WAKE_UP_CONTEXT_MAX_ITEMS
    ) {
      throw new Error(
        `max_items must be an integer from 1 to ${WAKE_UP_CONTEXT_MAX_ITEMS}`,
      );
    }

    maxItems = normalizedArgs.max_items;
  }

  let includeInbox = false;
  if (normalizedArgs.include_inbox != null) {
    if (typeof normalizedArgs.include_inbox !== "boolean") {
      throw new Error("include_inbox must be a boolean or null");
    }

    includeInbox = normalizedArgs.include_inbox;
  }

  const searchQuery = [task, project, goal].filter(Boolean).join(" ");
  const appliedKinds = includeInbox
    ? ["core", "dynamic", "inbox"]
    : ["core", "dynamic"];

  return {
    task,
    project,
    goal,
    max_items: maxItems,
    include_inbox: includeInbox,
    search_query: searchQuery,
    applied_kinds: appliedKinds,
    candidate_limit: Math.min(20, Math.max(12, maxItems * 3)),
  };
}

function compareWakeUpCandidates(left, right) {
  if (right.adjusted_score !== left.adjusted_score) {
    return right.adjusted_score - left.adjusted_score;
  }

  const pathOrder = left.relative_path.localeCompare(right.relative_path);
  if (pathOrder !== 0) {
    return pathOrder;
  }

  return left.section_path.localeCompare(right.section_path);
}

function sortWakeUpCandidates(candidates) {
  return [...candidates].sort(compareWakeUpCandidates);
}

function buildWakeUpCandidates(searchResults) {
  const candidates = [];
  let partialResultsCount = 0;

  for (const result of searchResults) {
    try {
      const trustRule = WAKE_UP_CONTEXT_TRUST_RULES[result.kind];
      if (!trustRule) {
        throw new Error(`Unsupported memory kind: ${result.kind}`);
      }

      candidates.push({
        key: `${result.relativePath}::${result.sectionPath}`,
        relative_path: result.relativePath,
        section_path: result.sectionPath,
        kind: result.kind,
        trust_level: trustRule.trust_level,
        matched_in: [...result.matchedIn],
        search_score: result.score,
        adjusted_score: result.score + trustRule.trust_bonus,
        snippet: result.snippet,
      });
    } catch {
      partialResultsCount += 1;
    }
  }

  return { candidates, partialResultsCount };
}

function dedupeWakeUpCandidates(candidates) {
  const deduped = new Map();

  for (const candidate of candidates) {
    const existing = deduped.get(candidate.key);
    if (!existing || candidate.search_score > existing.search_score) {
      deduped.set(candidate.key, candidate);
    }
  }

  return Array.from(deduped.values());
}

function isPathOnlyWakeUpCandidate(candidate) {
  return candidate.matched_in.length === 1 && candidate.matched_in[0] === "path";
}

function createWakeUpSelectionState(candidates, maxItems) {
  const kinds = new Set(candidates.map((candidate) => candidate.kind));

  return {
    maxItems,
    candidates,
    selected: [],
    selectedKeys: new Set(),
    selectedCountByFile: new Map(),
    selectedInboxCount: 0,
    hasBothTrustedKinds: kinds.has("core") && kinds.has("dynamic"),
  };
}

function getSelectedCountForFile(selectionState, relativePath) {
  return selectionState.selectedCountByFile.get(relativePath) ?? 0;
}

function getBasicWakeUpSelectionBlockReason(candidate, selectionState) {
  if (selectionState.selectedKeys.has(candidate.key)) {
    return "selected";
  }

  if (getSelectedCountForFile(selectionState, candidate.relative_path) >= 2) {
    return "same_file_cap";
  }

  if (candidate.kind === "inbox") {
    if (selectionState.selectedInboxCount >= WAKE_UP_CONTEXT_MAX_INBOX_ITEMS) {
      return "inbox_low_trust";
    }

    if (selectionState.hasBothTrustedKinds && selectionState.selected.length < 2) {
      return "inbox_low_trust";
    }
  }

  return null;
}

function getWakeUpSelectionBlockReason(candidate, selectionState) {
  const basicReason = getBasicWakeUpSelectionBlockReason(candidate, selectionState);
  if (basicReason) {
    return basicReason;
  }

  if (getSelectedCountForFile(selectionState, candidate.relative_path) >= 1) {
    const hasUnrepresentedAlternative = selectionState.candidates.some((other) => {
      if (other.key === candidate.key || selectionState.selectedKeys.has(other.key)) {
        return false;
      }

      if (getSelectedCountForFile(selectionState, other.relative_path) !== 0) {
        return false;
      }

      return !getBasicWakeUpSelectionBlockReason(other, selectionState);
    });

    if (hasUnrepresentedAlternative) {
      return "same_file_cap";
    }
  }

  return null;
}

function normalizeWakeUpReasonCodes(reasonCodes) {
  const seen = new Set(reasonCodes);
  return WAKE_UP_CONTEXT_REASON_CODE_ORDER.filter((code) => seen.has(code));
}

function buildWakeUpReasonSummary(candidate, reasonCodes) {
  if (reasonCodes.includes("low_trust_only_fallback")) {
    return "Low-trust fallback because only inbox matched.";
  }

  if (reasonCodes.includes("kind_complement")) {
    return `Added early as ${candidate.kind} context from another file.`;
  }

  if (reasonCodes.includes("anchor")) {
    return candidate.kind === "core"
      ? "Core anchor kept the bundle grounded."
      : "Dynamic anchor led on relevance.";
  }

  if (reasonCodes.includes("diversity_preserved")) {
    return "Selected from another file to preserve diversity.";
  }

  if (reasonCodes.includes("inbox_opt_in")) {
    return "Inbox was opted in and still cleared the cutoff.";
  }

  if (reasonCodes.includes("trust_bonus")) {
    return candidate.kind === "core"
      ? "High-trust core context stayed in the bundle."
      : "Trusted dynamic context stayed in the bundle.";
  }

  return "Included by adjusted score.";
}

function addWakeUpSelection(selectionState, candidate, reasonCodes) {
  const normalizedReasonCodes = normalizeWakeUpReasonCodes(reasonCodes);
  selectionState.selected.push({
    ...candidate,
    reason_codes: normalizedReasonCodes,
    reason_summary: buildWakeUpReasonSummary(candidate, normalizedReasonCodes),
  });
  selectionState.selectedKeys.add(candidate.key);
  selectionState.selectedCountByFile.set(
    candidate.relative_path,
    getSelectedCountForFile(selectionState, candidate.relative_path) + 1,
  );

  if (candidate.kind === "inbox") {
    selectionState.selectedInboxCount += 1;
  }
}

function fillWakeUpSelections(selectionState) {
  while (selectionState.selected.length < selectionState.maxItems) {
    let nextCandidate = null;

    for (const candidate of selectionState.candidates) {
      if (!getWakeUpSelectionBlockReason(candidate, selectionState)) {
        nextCandidate = candidate;
        break;
      }
    }

    if (!nextCandidate) {
      break;
    }

    const reasonCodes = [];
    if (nextCandidate.kind === "inbox") {
      reasonCodes.push("inbox_opt_in");
    } else {
      reasonCodes.push("trust_bonus");
    }

    const selectedFromNewFile =
      getSelectedCountForFile(selectionState, nextCandidate.relative_path) === 0;
    const skippedRepresentedFile = selectionState.candidates.some((candidate) => {
      if (candidate.key === nextCandidate.key || selectionState.selectedKeys.has(candidate.key)) {
        return false;
      }

      if (getSelectedCountForFile(selectionState, candidate.relative_path) === 0) {
        return false;
      }

      return !getBasicWakeUpSelectionBlockReason(candidate, selectionState);
    });

    if (selectedFromNewFile && skippedRepresentedFile) {
      reasonCodes.push("diversity_preserved");
    }

    addWakeUpSelection(selectionState, nextCandidate, reasonCodes);
  }
}

function buildWakeUpWarnings({
  items,
  maxItems,
  candidatePoolTruncated,
  partialResultsCount,
  onlyInboxMatchesExcluded,
  lowTrustOnly,
}) {
  const warnings = [];

  if (items.length === 0) {
    warnings.push(
      onlyInboxMatchesExcluded
        ? "ONLY_INBOX_MATCHES_EXCLUDED"
        : "NO_MATCHES",
    );
  }

  if (lowTrustOnly) {
    warnings.push("LOW_TRUST_ONLY");
  }

  if (items.length > 0 && items.length < maxItems) {
    warnings.push("SPARSE_RESULTS");
  }

  if (
    items.length > 0 &&
    new Set(items.map((item) => item.relative_path)).size === 1
  ) {
    warnings.push("SINGLE_FILE_BUNDLE");
  }

  if (candidatePoolTruncated) {
    warnings.push("CANDIDATE_POOL_TRUNCATED");
  }

  if (partialResultsCount > 0) {
    warnings.push("PARTIAL_RESULTS");
  }

  return warnings.map((code) => ({
    code,
    message: WAKE_UP_CONTEXT_WARNING_MESSAGES[code],
  }));
}

function buildWakeUpSummary({
  items,
  includeInbox,
  warnings,
}) {
  const warningCodes = new Set(warnings.map((warning) => warning.code));
  const includesInbox = items.some((item) => item.kind === "inbox");
  const anchorKind = items[0]?.kind ?? null;

  let firstSentence;
  if (warningCodes.has("ONLY_INBOX_MATCHES_EXCLUDED")) {
    firstSentence =
      "No trusted wake-up bundle was selected because only inbox matches were found and inbox was not requested.";
  } else if (warningCodes.has("NO_MATCHES")) {
    firstSentence = includeInbox
      ? "No wake-up bundle matches were found in core, dynamic, or inbox."
      : "No wake-up bundle matches were found in core and dynamic, and inbox was not requested.";
  } else if (warningCodes.has("LOW_TRUST_ONLY")) {
    firstSentence =
      "Bundle falls back to low-trust inbox context because no trusted matches were available.";
  } else if (anchorKind === "core") {
    firstSentence = includesInbox
      ? "Bundle is anchored in core and includes one inbox item."
      : includeInbox
        ? "Bundle is anchored in core and leaves inbox out after trust-aware reranking."
        : "Bundle is anchored in core and uses trusted kinds only.";
  } else if (anchorKind === "dynamic") {
    firstSentence = includesInbox
      ? "Bundle is anchored in dynamic context and includes one inbox item."
      : includeInbox
        ? "Bundle is anchored in dynamic context and leaves inbox out after trust-aware reranking."
        : "Bundle is anchored in dynamic context and uses trusted kinds only.";
  } else {
    firstSentence =
      "Wake-up context selection completed without choosing a primary trusted anchor.";
  }

  const followUps = [];
  if (warningCodes.has("SPARSE_RESULTS")) {
    followUps.push("results are sparse");
  }
  if (warningCodes.has("SINGLE_FILE_BUNDLE")) {
    followUps.push("all selected items came from one file");
  }
  if (warningCodes.has("PARTIAL_RESULTS")) {
    followUps.push("some candidates could not be assembled cleanly");
  }

  const secondSentence =
    followUps.length > 0 ? `Additional notes: ${followUps.join("; ")}.` : "";

  return [firstSentence, secondSentence].filter(Boolean).join(" ");
}

function determineWakeUpNextReadReason(candidate, selectionState, includeInbox) {
  if (candidate.kind === "inbox" && !includeInbox) {
    return "inbox_not_requested";
  }

  if (candidate.kind === "inbox" && includeInbox) {
    return "inbox_low_trust";
  }

  if (getSelectedCountForFile(selectionState, candidate.relative_path) >= 1) {
    return "same_file_cap";
  }

  return "lower_adjusted_score";
}

function compareWakeUpNextReads(left, right) {
  const priorityDiff =
    WAKE_UP_CONTEXT_NEXT_READ_PRIORITY[left.reason_not_selected] -
    WAKE_UP_CONTEXT_NEXT_READ_PRIORITY[right.reason_not_selected];
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  if (right.adjusted_score !== left.adjusted_score) {
    return right.adjusted_score - left.adjusted_score;
  }

  const pathOrder = left.relative_path.localeCompare(right.relative_path);
  if (pathOrder !== 0) {
    return pathOrder;
  }

  return left.section_path.localeCompare(right.section_path);
}

function buildWakeUpNextReads({
  candidatePool,
  pathOnlyExcludedCandidates,
  inboxExcludedCandidates,
  selectionState,
  includeInbox,
}) {
  const selectedKeys = new Set(selectionState.selectedKeys);
  const nextReadsByKey = new Map();

  const addNextRead = (candidate, reasonNotSelected) => {
    if (selectedKeys.has(candidate.key) || nextReadsByKey.has(candidate.key)) {
      return;
    }

    nextReadsByKey.set(candidate.key, {
      relative_path: candidate.relative_path,
      section_path: candidate.section_path,
      kind: candidate.kind,
      trust_level: candidate.trust_level,
      adjusted_score: candidate.adjusted_score,
      reason_not_selected: reasonNotSelected,
    });
  };

  for (const candidate of pathOnlyExcludedCandidates) {
    addNextRead(candidate, "path_only_candidate");
  }

  for (const candidate of inboxExcludedCandidates) {
    addNextRead(candidate, "inbox_not_requested");
  }

  for (const candidate of candidatePool) {
    if (selectedKeys.has(candidate.key)) {
      continue;
    }

    addNextRead(
      candidate,
      determineWakeUpNextReadReason(candidate, selectionState, includeInbox),
    );
  }

  return Array.from(nextReadsByKey.values())
    .sort(compareWakeUpNextReads)
    .slice(0, WAKE_UP_CONTEXT_MAX_NEXT_READS)
    .map(({ adjusted_score, ...nextRead }) => nextRead);
}

function buildWakeUpContextReport(roots, args) {
  const normalized = normalizeWakeUpContextArgs(args);
  const searchReport = findMemoryMatches(roots, {
    query: normalized.search_query,
    kinds: normalized.applied_kinds,
    max_results: normalized.candidate_limit,
  });
  const { candidates: builtCandidates, partialResultsCount } = buildWakeUpCandidates(
    searchReport.results,
  );
  const candidatePool = sortWakeUpCandidates(dedupeWakeUpCandidates(builtCandidates));
  const nonPathOnlyCandidates = candidatePool.filter(
    (candidate) => !isPathOnlyWakeUpCandidate(candidate),
  );
  const pathOnlyExcludedCandidates =
    nonPathOnlyCandidates.length > 0
      ? candidatePool.filter((candidate) => isPathOnlyWakeUpCandidate(candidate))
      : [];
  const eligibleCandidates =
    nonPathOnlyCandidates.length > 0 ? nonPathOnlyCandidates : candidatePool;
  const selectionState = createWakeUpSelectionState(
    eligibleCandidates,
    normalized.max_items,
  );

  const eligibleCoreCandidates = eligibleCandidates.filter(
    (candidate) => candidate.kind === "core",
  );
  const eligibleTrustedCandidates = eligibleCandidates.filter(
    (candidate) => candidate.kind === "core" || candidate.kind === "dynamic",
  );
  const eligibleInboxCandidates = eligibleCandidates.filter(
    (candidate) => candidate.kind === "inbox",
  );
  const bestCoreCandidate = eligibleCoreCandidates[0] ?? null;
  const bestTrustedCandidate = eligibleTrustedCandidates[0] ?? null;

  let lowTrustOnly = false;
  if (bestTrustedCandidate) {
    const rankOneCandidate =
      bestCoreCandidate &&
      bestCoreCandidate.adjusted_score >= bestTrustedCandidate.adjusted_score - 6
        ? bestCoreCandidate
        : bestTrustedCandidate;
    addWakeUpSelection(selectionState, rankOneCandidate, [
      "anchor",
      rankOneCandidate.kind === "inbox" ? "inbox_opt_in" : "trust_bonus",
    ]);
  } else if (normalized.include_inbox && eligibleInboxCandidates.length > 0) {
    lowTrustOnly = true;
    addWakeUpSelection(selectionState, eligibleInboxCandidates[0], [
      "anchor",
      "inbox_opt_in",
      "low_trust_only_fallback",
    ]);
  }

  if (!lowTrustOnly && selectionState.selected.length > 0) {
    const rankOneKind = selectionState.selected[0].kind;
    const complementaryKind =
      rankOneKind === "core"
        ? "dynamic"
        : rankOneKind === "dynamic"
          ? "core"
          : null;

    if (complementaryKind) {
      const complementaryCandidate = eligibleCandidates.find(
        (candidate) =>
          candidate.kind === complementaryKind &&
          !selectionState.selectedKeys.has(candidate.key) &&
          candidate.relative_path !== selectionState.selected[0].relative_path,
      );

      if (complementaryCandidate) {
        addWakeUpSelection(selectionState, complementaryCandidate, [
          "trust_bonus",
          "kind_complement",
        ]);
      }
    }
  }

  fillWakeUpSelections(selectionState);

  let inboxExcludedCandidates = [];
  let onlyInboxMatchesExcluded = false;

  if (!normalized.include_inbox) {
    const inboxSearchReport = findMemoryMatches(roots, {
      query: normalized.search_query,
      kinds: ["inbox"],
      max_results: normalized.candidate_limit,
    });
    const { candidates: builtInboxCandidates } = buildWakeUpCandidates(
      inboxSearchReport.results,
    );
    inboxExcludedCandidates = sortWakeUpCandidates(
      dedupeWakeUpCandidates(builtInboxCandidates),
    );
    onlyInboxMatchesExcluded =
      selectionState.selected.length === 0 && inboxExcludedCandidates.length > 0;
  }

  const items = selectionState.selected.map((item, index) => ({
    rank: index + 1,
    relative_path: item.relative_path,
    section_path: item.section_path,
    kind: item.kind,
    trust_level: item.trust_level,
    matched_in: item.matched_in,
    search_score: item.search_score,
    adjusted_score: item.adjusted_score,
    reason_codes: item.reason_codes,
    reason_summary: item.reason_summary,
    snippet: item.snippet,
  }));
  const warnings = buildWakeUpWarnings({
    items,
    maxItems: normalized.max_items,
    candidatePoolTruncated: searchReport.truncated,
    partialResultsCount,
    onlyInboxMatchesExcluded,
    lowTrustOnly,
  });

  return {
    task: normalized.task,
    project: normalized.project,
    goal: normalized.goal,
    search_query: normalized.search_query,
    max_items: normalized.max_items,
    include_inbox: normalized.include_inbox,
    applied_kinds: normalized.applied_kinds,
    candidate_pool_truncated: searchReport.truncated,
    eligible_candidate_count: eligibleCandidates.length,
    summary: buildWakeUpSummary({
      items,
      includeInbox: normalized.include_inbox,
      warnings,
    }),
    warnings,
    items,
    next_reads: buildWakeUpNextReads({
      candidatePool: eligibleCandidates,
      pathOnlyExcludedCandidates,
      inboxExcludedCandidates,
      selectionState,
      includeInbox: normalized.include_inbox,
    }),
  };
}

function formatWakeUpContextReport(report) {
  const lines = [
    "# Wake Up Context",
    `- Task: ${report.task}`,
  ];

  if (report.project) {
    lines.push(`- Project: ${report.project}`);
  }

  if (report.goal) {
    lines.push(`- Goal: ${report.goal}`);
  }

  lines.push(
    `- Included kinds: ${report.applied_kinds.join(", ")}`,
    `- Bundle size: ${report.items.length} of ${report.max_items}`,
    "",
    "## Orientation",
    report.summary,
    "",
    "## Ranked Context",
  );

  if (report.items.length === 0) {
    lines.push("No items selected.");
  } else {
    for (const item of report.items) {
      lines.push(
        `${item.rank}. ${item.relative_path}`,
        `- Section: ${item.section_path}`,
        `- Kind: ${item.kind}`,
        `- Trust: ${item.trust_level}`,
        `- Matched in: ${item.matched_in.join(", ")}`,
        `- Search score: ${item.search_score}`,
        `- Adjusted score: ${item.adjusted_score}`,
        `- Why included: ${item.reason_summary}`,
        `- Snippet: ${item.snippet}`,
      );
    }
  }

  if (report.next_reads.length > 0) {
    lines.push("", "## Next Reads");
    for (const nextRead of report.next_reads) {
      lines.push(
        `- ${nextRead.relative_path}`,
        `- Section: ${nextRead.section_path}`,
        `- Kind: ${nextRead.kind}`,
        `- Trust: ${nextRead.trust_level}`,
        `- Why not selected: ${nextRead.reason_not_selected}`,
      );
    }
  }

  if (report.warnings.length > 0) {
    lines.push("", "## Warnings");
    for (const warning of report.warnings) {
      lines.push(`- ${warning.code}: ${warning.message}`);
    }
  }

  return lines.join("\n");
}

function registerResources(server, roots) {
  for (const kind of MEMORY_KINDS) {
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
              text: fs.readFileSync(resolveFilePath(roots, kind, fileName), "utf8"),
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

export function createPersonalContextRuntime({
  entryFileUrl,
  env = process.env,
  contextRoot,
} = {}) {
  const debugEnabled = env.PERSONAL_CONTEXT_DEBUG === "1";
  const debugLog = createDebugLogger(debugEnabled);
  let resolvedContextRoot = contextRoot ? path.resolve(contextRoot) : null;

  if (!resolvedContextRoot) {
    if (!entryFileUrl) {
      throw new Error(
        "entryFileUrl is required when contextRoot is not provided.",
      );
    }

    const serverFilePath = fileURLToPath(entryFileUrl);
    const serverDir = path.dirname(serverFilePath);
    resolvedContextRoot = determineContextRoot(serverDir, env);
  }

  if (!fs.existsSync(resolvedContextRoot)) {
    throw new Error(
      `Personal context root does not exist: ${resolvedContextRoot}. Choose the personal context folder in the extension settings.`,
    );
  }

  const roots = {
    core: path.join(resolvedContextRoot, "core"),
    dynamic: path.join(resolvedContextRoot, "dynamic"),
    inbox: path.join(resolvedContextRoot, "inbox"),
  };

  ensurePortfolioScaffold(roots);
  debugLog(`contextRoot=${resolvedContextRoot}`);

  return {
    contextRoot: resolvedContextRoot,
    roots,
    debugLog,
    instructions: SERVER_INSTRUCTIONS,
    toolNames: [...TOOL_NAMES],
    listMemoryFiles() {
      return memoryFileSummary(roots);
    },
    readMemoryFile(relativePath) {
      return readMemoryFile(roots, relativePath);
    },
    appendMemoryEntry(args) {
      return appendMemoryEntry(roots, args);
    },
    replaceDynamicSection(args) {
      return replaceDynamicSection(roots, args);
    },
    bootstrapDynamicMemory(args) {
      return bootstrapDynamicMemory(roots, args);
    },
    proposeCoreUpdate(args) {
      return proposeCoreUpdate(roots, args);
    },
    getStatusReport() {
      return buildStatusReport(resolvedContextRoot, roots);
    },
    getStatusText() {
      return formatStatusReport(buildStatusReport(resolvedContextRoot, roots));
    },
    searchMemory(args) {
      return findMemoryMatches(roots, args);
    },
    searchMemoryText(args) {
      return formatSearchResults(findMemoryMatches(roots, args));
    },
    wakeUpContext(args) {
      return buildWakeUpContextReport(roots, args);
    },
    wakeUpContextText(args) {
      return formatWakeUpContextReport(buildWakeUpContextReport(roots, args));
    },
  };
}

export function createPersonalContextServer({ entryFileUrl, env = process.env } = {}) {
  const runtime = createPersonalContextRuntime({ entryFileUrl, env });

  const server = new McpServer(
    {
      name: "personal-context",
      version: SERVER_VERSION,
    },
    {
      instructions: runtime.instructions,
    },
  );

  registerResources(server, runtime.roots);

  server.registerTool(
    "status",
    {
      description:
        "Show the current personal-context portfolio status, including file coverage, write boundaries, and available capabilities.",
      inputSchema: {},
    },
    async () => textResult(runtime.getStatusText()),
  );

  server.registerTool(
    "list_memory_files",
    {
      description:
        "List the available core, dynamic, and inbox markdown files in the personal context portfolio.",
      inputSchema: {},
    },
    async () => textResult(runtime.listMemoryFiles()),
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
      const { relativePath, text } = runtime.readMemoryFile(relative_path);
      return textResult(`# ${relativePath}\n\n${text}`);
    },
  );

  server.registerTool(
    "search_memory",
    {
      description:
        "Search the markdown memory portfolio by query, with optional kind or file filters. Returns ranked file and section snippets.",
      inputSchema: {
        query: z.string().min(1),
        kinds: z.array(z.enum(MEMORY_KINDS)).optional(),
        relative_paths: z
          .array(
            z
              .string()
              .regex(/^(core|dynamic|inbox)\/[A-Za-z0-9._-]+\.md$/),
          )
          .optional(),
        max_results: z.number().int().min(1).max(20).optional(),
      },
    },
    async (args) => textResult(runtime.searchMemoryText(args)),
  );

  server.registerTool(
    "wake_up_context",
    {
      description:
        "Build a small, trust-aware startup reading bundle for the current task by reranking search_memory results across core, dynamic, and optional inbox memory.",
      inputSchema: {
        task: z.string().optional(),
        project: z.string().nullable().optional(),
        goal: z.string().nullable().optional(),
        max_items: z.number().nullable().optional(),
        include_inbox: z.boolean().nullable().optional(),
      },
    },
    async (args = {}) => textResult(runtime.wakeUpContextText(args ?? {})),
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
    async (args) => textResult(runtime.appendMemoryEntry(args)),
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
    async (args) => textResult(runtime.replaceDynamicSection(args)),
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
    async (args) => textResult(runtime.bootstrapDynamicMemory(args)),
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
    async (args) => textResult(runtime.proposeCoreUpdate(args)),
  );

  return {
    server,
    contextRoot: runtime.contextRoot,
    debugLog: runtime.debugLog,
  };
}

export async function startPersonalContextServer(entryFileUrl, env = process.env) {
  const { server, debugLog } = createPersonalContextServer({ entryFileUrl, env });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  debugLog("SDK server connected");
}
