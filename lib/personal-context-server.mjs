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

const CANONICAL_APPEND_TARGET_SECTIONS = new Map([
  ["current-priorities", "## Active Priorities"],
  ["active-campaigns", "## Campaigns"],
  ["recent-learnings", "## Learnings"],
  ["message-tests", "## Tests"],
  ["account-patterns", "## Patterns"],
  ["raw-notes", "## Notes"],
  ["core-update-proposals", "## Proposed Updates"],
]);

const APPEND_TARGET_SECTION_ALIASES = new Map([
  ["active-campaigns", ["## Live Motions"]],
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
  "writing_style_context",
  "product_positioning_context",
  "outbound_framing_context",
  "search_memory",
  "wake_up_context",
  "manual_ingest",
  "promote_raw_note",
  "mark_raw_note_status",
  "link_raw_note_to_proposal",
  "append_memory_entry",
  "maintain_dynamic_item",
  "replace_dynamic_section",
  "bootstrap_dynamic_memory",
  "propose_core_update",
];

const SEARCH_MODE = "markdown-scan-v1";

const SERVER_VERSION = "0.1.0";

export const SERVER_INSTRUCTIONS =
  "Use core files as durable source of truth. When a user asks for their usual writing style or asks to rewrite something to match it, prefer writing_style_context. When a user asks for their core product positioning principles, prefer product_positioning_context. When a user asks for their usual outbound or prospect framing, prefer outbound_framing_context. Call wake_up_context before answering broader durable self-context requests like 'what should I focus on this week?', 'what is the current status of this project or POC and what should happen next?', 'continue this plan', or 'pick up where we left off', and when a request spans multiple durable themes. For usual-style, product-positioning, outbound-framing, weekly-focus, project-status, next-step, or durable-continuation requests, do not rely on chat-history or relevant-chats retrieval alone when personal-context is available. Use search_memory instead only for direct retrieval, explicit matching, or narrower file or kind control, or after a wrapper tool or wake_up_context returns sparse or empty results. When a user provides pasted notes, a transcript excerpt, or a rough summary they want stored, prefer manual_ingest so it lands in inbox/raw-notes.md with visible provenance first. When a user wants to promote one reviewed raw note into reusable working memory or a protected core-update proposal, prefer promote_raw_note so the destination entry keeps an explicit source-note trail. After a raw note has been reviewed or promoted, prefer mark_raw_note_status to keep inbox/raw-notes.md auditable without deleting the source note. When a raw note supports an existing proposal that already lives in inbox/core-update-proposals.md, prefer link_raw_note_to_proposal so the source note records that relationship without creating a duplicate proposal entry. Write new learnings, campaign updates, and rough notes only to dynamic or inbox files. Do not edit core files directly; propose core changes through inbox/core-update-proposals.md.";

export const SEARCH_MEMORY_TOOL_DESCRIPTION =
  "Search the markdown memory portfolio by query, with optional kind or file filters. Use this for direct retrieval or explicit matching requests, not as the default first step for usual-style, core product-positioning, usual outbound-framing, weekly-focus, project-status-or-next-step, or continue-the-plan prompts, where the matching wrapper tool or wake_up_context should be preferred first. Returns ranked file and section snippets.";

export const WAKE_UP_CONTEXT_TOOL_DESCRIPTION =
  "Build a small, trust-aware startup reading bundle for the current task by reranking search_memory results across core, dynamic, and optional inbox memory. Use this for broader or mixed durable self-context tasks like weekly focus, current status and next step, continuing an existing plan, or picking up where the user left off, and as a fallback when a style, product-positioning, or outbound-framing request does not fit a more specific wrapper tool.";

export const WRITING_STYLE_CONTEXT_TOOL_DESCRIPTION =
  "Build a trust-aware startup reading bundle focused on the user's usual writing style and voice. Prefer this before answering prompts like 'What is my usual writing style?' or 'Rewrite this email to match it.' Delegates to the same wake_up_context selection logic with a style-focused task anchor.";

export const PRODUCT_POSITIONING_CONTEXT_TOOL_DESCRIPTION =
  "Build a trust-aware startup reading bundle focused on the user's core product positioning principles. Prefer this before answering prompts like 'What are my core product positioning principles?' or close variations that need durable positioning context. Delegates to the same wake_up_context selection logic with a positioning-focused task anchor.";

export const OUTBOUND_FRAMING_CONTEXT_TOOL_DESCRIPTION =
  "Build a trust-aware startup reading bundle focused on the user's usual outbound or prospect framing. Prefer this before answering prompts like 'What is my usual outbound framing for prospects?' or close variations that need durable outbound context. Delegates to the same wake_up_context selection logic with an outbound-framing task anchor.";

export const MANUAL_INGEST_TOOL_DESCRIPTION =
  "Capture pasted notes, transcript excerpts, or rough summaries into low-trust inbox/raw-notes.md with visible provenance. Prefer this explicit manual-ingestion flow before using lower-level write tools. Supports dry_run preview and never writes to core files.";

export const PROMOTE_RAW_NOTE_TOOL_DESCRIPTION =
  "Promote one reviewed raw note from inbox/raw-notes.md into dynamic/recent-learnings.md or inbox/core-update-proposals.md with visible provenance back to the source note. Supports dry_run preview and never edits core files directly.";

export const MARK_RAW_NOTE_STATUS_TOOL_DESCRIPTION =
  "Mark one raw note in inbox/raw-notes.md as reviewed or promoted without deleting it. Supports dry_run preview, exact note selection by heading, and optional promotion-target metadata so reviewed notes stop looking unresolved.";

export const LINK_RAW_NOTE_TO_PROPOSAL_TOOL_DESCRIPTION =
  "Link one raw note in inbox/raw-notes.md to an existing entry in inbox/core-update-proposals.md without creating a duplicate proposal. Supports dry_run preview, validates the proposal heading exactly, and keeps the write limited to the source raw note.";

const WRITING_STYLE_CONTEXT_DEFAULT_TASK = "usual writing style and voice";
const PRODUCT_POSITIONING_CONTEXT_DEFAULT_TASK =
  "core product positioning principles";
const OUTBOUND_FRAMING_CONTEXT_DEFAULT_TASK =
  "usual outbound framing for prospects";
const MANUAL_INGEST_SOURCE_TYPES = ["note", "summary", "transcript_excerpt"];
const PROMOTE_RAW_NOTE_DESTINATIONS = [
  "recent_learning",
  "core_update_proposal",
];
const MARK_RAW_NOTE_STATUS_VALUES = ["reviewed", "promoted"];
const MARK_RAW_NOTE_PROMOTION_TARGETS = [
  "dynamic/recent-learnings.md",
  "inbox/core-update-proposals.md",
];
const LINK_RAW_NOTE_TO_PROPOSAL_TARGET = "inbox/core-update-proposals.md";
const MANUAL_INGEST_PREVIEW_LINE_LIMIT = 3;
const MANUAL_INGEST_PREVIEW_LINE_MAX_LENGTH = 180;
const MANUAL_INGEST_PREVIEW_TIMESTAMP = "PENDING_TIMESTAMP";

const LOW_SIGNAL_SECTION_TITLES = new Set([
  "Purpose",
  "Suggested Entry Format",
  "Entry Guidance",
]);

const EMPTY_WRITABLE_SECTION_FALLBACKS = new Map([
  ["current-priorities::## Active Priorities", "- No live priorities recorded yet."],
  ["active-campaigns::## Campaigns", "- No active campaigns recorded yet."],
  ["active-campaigns::## Live Motions", "- No active campaigns recorded yet."],
  ["recent-learnings::## Learnings", "- No learnings recorded yet."],
  ["message-tests::## Tests", "- No message tests recorded yet."],
  ["account-patterns::## Patterns", "- No account patterns recorded yet."],
  ["raw-notes::## Notes", "- No raw notes recorded yet."],
  [
    "core-update-proposals::## Proposed Updates",
    "- No core update proposals recorded yet.",
  ],
]);

const SEARCH_REASON_CODE_ORDER = [
  "matched_all_terms",
  "content_match",
  "heading_match",
  "path_match",
  "downranked_noise",
];

const SEARCH_MATCH_LOCATION_ORDER = ["content", "heading", "path"];

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

export function normalizeReadMemoryFileArgs(args) {
  const relativePath = args?.relative_path ?? args?.path;

  if (typeof relativePath !== "string") {
    throw new Error(
      "read_memory_file requires relative_path (or tolerated alias path) like core/file.md",
    );
  }

  if (args?.relative_path && args?.path && args.relative_path !== args.path) {
    throw new Error(
      "read_memory_file received conflicting relative_path and path values",
    );
  }

  parseRelativePath(relativePath);
  return relativePath;
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

function replaceMarkdownSectionLines(markdown, heading, replacementLines) {
  const normalizedLines =
    replacementLines.length > 0 ? replacementLines : ["- None"];
  const { lines, headingIndex, sectionEndIndex, lineEnding, hasTrailingNewline } =
    findSectionBounds(markdown, heading);

  const nextLines = [
    ...lines.slice(0, headingIndex + 1),
    ...normalizedLines,
  ];

  if (sectionEndIndex < lines.length && nextLines[nextLines.length - 1] !== "") {
    nextLines.push("");
  }

  nextLines.push(...lines.slice(sectionEndIndex));

  return rebuildMarkdown(nextLines, lineEnding, hasTrailingNewline);
}

function replaceMarkdownSection(markdown, heading, replacementBody) {
  const normalizedBody = replacementBody.trim().length > 0 ? replacementBody.trim() : "- None";
  const replacementLines = trimBlankLines(normalizedBody.split(/\r?\n/));
  return replaceMarkdownSectionLines(markdown, heading, replacementLines);
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
    timestamp,
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

  const lines = buildMemoryEntryLines({
    title,
    summary,
    bullets,
    source,
    evidence_links,
    tags,
    timestamp,
  });

  const entry = lines.join("\n");
  const appendTarget = requireResolvedAppendTargetSection(
    cleaned,
    file,
    `${kind}/${fileName}`,
  );

  const nextText = insertIntoSection(
    cleaned,
    appendTarget.appendTargetSection,
    entry,
  );

  fs.writeFileSync(filePath, nextText, "utf8");
  return `Appended memory entry to ${kind}/${fileName}.`;
}

function buildMemoryEntryLines({
  title,
  summary,
  bullets = [],
  source = "",
  evidence_links = [],
  tags = [],
  timestamp = new Date().toISOString(),
}) {
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

  return lines;
}

function normalizeDynamicItemText(text) {
  if (typeof text !== "string") {
    return "";
  }

  return trimBlankLines(text.split(/\r?\n/)).join("\n");
}

function isDynamicBulletLine(line) {
  return /^-\s+/.test(line);
}

function isDynamicEntryHeading(line) {
  return /^###\s+/.test(line);
}

function listDynamicSectionItems(markdown, sectionHeading) {
  const { lines, headingIndex, sectionEndIndex } = findSectionBounds(
    markdown,
    sectionHeading,
  );
  const bodyLines = lines.slice(headingIndex + 1, sectionEndIndex);
  const items = [];

  for (let index = 0; index < bodyLines.length; ) {
    const line = bodyLines[index];
    if (typeof line !== "string" || line.trim().length === 0) {
      index += 1;
      continue;
    }

    if (isDynamicBulletLine(line)) {
      const itemLines = [line];
      items.push({
        kind: "bullet",
        start: index,
        end: index + 1,
        lines: itemLines,
        text: normalizeDynamicItemText(itemLines.join("\n")),
      });
      index += 1;
      continue;
    }

    if (isDynamicEntryHeading(line)) {
      const start = index;
      index += 1;

      while (index < bodyLines.length) {
        const currentLine = bodyLines[index];
        if (
          currentLine.trim().length === 0 ||
          isDynamicEntryHeading(currentLine)
        ) {
          break;
        }

        index += 1;
      }

      const itemLines = bodyLines.slice(start, index);
      items.push({
        kind: "entry",
        start,
        end: index,
        lines: itemLines,
        text: normalizeDynamicItemText(itemLines.join("\n")),
      });
      continue;
    }

    index += 1;
  }

  return { bodyLines, items };
}

function normalizeSectionBodyLines(lines) {
  const trimmedLines = trimBlankLines(lines);
  const normalizedLines = [];
  let previousWasBlank = false;

  for (const line of trimmedLines) {
    const isBlank = line.trim().length === 0;
    if (isBlank) {
      if (!previousWasBlank) {
        normalizedLines.push("");
      }
    } else {
      normalizedLines.push(line);
    }

    previousWasBlank = isBlank;
  }

  return normalizedLines;
}

function getWritableSectionFallback(file, sectionHeading) {
  return (
    EMPTY_WRITABLE_SECTION_FALLBACKS.get(`${file}::${sectionHeading}`) ?? "- None"
  );
}

function getAppendTargetSectionCandidates(file) {
  const canonicalSection = CANONICAL_APPEND_TARGET_SECTIONS.get(file);
  if (!canonicalSection) {
    return [];
  }

  return [
    canonicalSection,
    ...(APPEND_TARGET_SECTION_ALIASES.get(file) ?? []),
  ];
}

function resolveAppendTargetSection(markdown, file) {
  const candidateSections = getAppendTargetSectionCandidates(file);
  const canonicalAppendTargetSection = candidateSections[0] ?? null;

  if (!canonicalAppendTargetSection) {
    return {
      appendTargetSection: null,
      appendTargetPresent: false,
      appendTargetResolution: "missing",
      canonicalAppendTargetSection: null,
      appendTargetCandidates: candidateSections,
    };
  }

  if (hasMarkdownSection(markdown, canonicalAppendTargetSection)) {
    return {
      appendTargetSection: canonicalAppendTargetSection,
      appendTargetPresent: true,
      appendTargetResolution: "canonical",
      canonicalAppendTargetSection,
      appendTargetCandidates: candidateSections,
    };
  }

  for (const candidateSection of candidateSections.slice(1)) {
    if (hasMarkdownSection(markdown, candidateSection)) {
      return {
        appendTargetSection: candidateSection,
        appendTargetPresent: true,
        appendTargetResolution: "alias",
        canonicalAppendTargetSection,
        appendTargetCandidates: candidateSections,
      };
    }
  }

  return {
    appendTargetSection: canonicalAppendTargetSection,
    appendTargetPresent: false,
    appendTargetResolution: "missing",
    canonicalAppendTargetSection,
    appendTargetCandidates: candidateSections,
  };
}

function requireResolvedAppendTargetSection(markdown, file, relativePath) {
  const appendTarget = resolveAppendTargetSection(markdown, file);
  if (!appendTarget.appendTargetPresent || !appendTarget.appendTargetSection) {
    throw new Error(
      `Append target section not found in ${relativePath}. Checked: ${appendTarget.appendTargetCandidates.join(", ")}`,
    );
  }

  return appendTarget;
}

function overwriteResolvedDynamicAppendSection(roots, file, content) {
  const filePath = resolveFilePath(roots, "dynamic", `${file}.md`);
  const relativePath = `dynamic/${file}.md`;
  const existing = fs.readFileSync(filePath, "utf8");
  const appendTarget = requireResolvedAppendTargetSection(
    existing,
    file,
    relativePath,
  );
  const allowedSections = listReplaceableDynamicSections(roots, file);

  if (!allowedSections.includes(appendTarget.appendTargetSection)) {
    throw new Error(
      `Append target section is not replaceable for ${file}: ${appendTarget.appendTargetSection}`,
    );
  }

  const updated = replaceMarkdownSection(
    existing,
    appendTarget.appendTargetSection,
    content,
  );
  fs.writeFileSync(filePath, updated, "utf8");
}

function normalizeDynamicItemReplacement(itemKind, replacementText) {
  const replacementLines = trimBlankLines(
    String(replacementText ?? "").split(/\r?\n/),
  );

  if (replacementLines.length === 0) {
    throw new Error("replacement_text is required when operation is replace");
  }

  if (itemKind === "bullet") {
    if (
      replacementLines.length !== 1 ||
      !isDynamicBulletLine(replacementLines[0])
    ) {
      throw new Error(
        "Bullet replacements must be a single markdown bullet line.",
      );
    }

    return replacementLines;
  }

  if (itemKind === "entry") {
    if (!isDynamicEntryHeading(replacementLines[0])) {
      throw new Error(
        "Dated entry replacements must start with a markdown ### heading.",
      );
    }

    return replacementLines;
  }

  throw new Error(`Unsupported dynamic item kind: ${itemKind}`);
}

function maintainDynamicItem(roots, args) {
  const { file, section_heading, match_text, operation, replacement_text } = args;

  if (!DYNAMIC_FILE_NAMES.includes(file)) {
    throw new Error(`Item maintenance is only allowed for dynamic files: ${file}`);
  }

  const allowedSections = listReplaceableDynamicSections(roots, file);
  if (!allowedSections.includes(section_heading)) {
    throw new Error(
      `Item maintenance is not allowed for ${file}: ${section_heading}`,
    );
  }

  const normalizedMatchText = normalizeDynamicItemText(match_text);
  if (!normalizedMatchText) {
    throw new Error("match_text is required");
  }

  if (
    operation === "remove" &&
    normalizeDynamicItemText(replacement_text).length > 0
  ) {
    throw new Error("replacement_text must be empty when operation is remove");
  }

  const filePath = resolveFilePath(roots, "dynamic", `${file}.md`);
  const existing = fs.readFileSync(filePath, "utf8");
  const { bodyLines, items } = listDynamicSectionItems(existing, section_heading);
  const matches = items.filter((item) => item.text === normalizedMatchText);

  if (matches.length === 0) {
    throw new Error(
      `Exact item not found in dynamic/${file}.md ${section_heading}`,
    );
  }

  if (matches.length > 1) {
    throw new Error(
      `Exact item match is ambiguous in dynamic/${file}.md ${section_heading}`,
    );
  }

  const matchedItem = matches[0];
  const replacementLines =
    operation === "replace"
      ? normalizeDynamicItemReplacement(matchedItem.kind, replacement_text)
      : [];
  const nextBodyLines = normalizeSectionBodyLines([
    ...bodyLines.slice(0, matchedItem.start),
    ...replacementLines,
    ...bodyLines.slice(matchedItem.end),
  ]);
  const bodyLinesWithFallback =
    nextBodyLines.length > 0
      ? nextBodyLines
      : [getWritableSectionFallback(file, section_heading)];
  const updated = replaceMarkdownSectionLines(
    existing,
    section_heading,
    bodyLinesWithFallback,
  );

  fs.writeFileSync(filePath, updated, "utf8");

  return operation === "replace"
    ? `Replaced exact ${matchedItem.kind} in dynamic/${file}.md ${section_heading}.`
    : `Removed exact ${matchedItem.kind} from dynamic/${file}.md ${section_heading}.`;
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

  overwriteResolvedDynamicAppendSection(
    roots,
    "current-priorities",
    toBullets(current_priorities, "- No live priorities recorded yet."),
  );
  overwriteResolvedDynamicAppendSection(
    roots,
    "active-campaigns",
    toBullets(active_campaigns, "- No active campaigns recorded yet."),
  );
  overwriteResolvedDynamicAppendSection(
    roots,
    "recent-learnings",
    toBullets(recent_learnings, "- No learnings recorded yet."),
  );
  overwriteResolvedDynamicAppendSection(
    roots,
    "message-tests",
    toBullets(message_tests, "- No message tests recorded yet."),
  );
  overwriteResolvedDynamicAppendSection(
    roots,
    "account-patterns",
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

function normalizeOptionalText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = collapseWhitespace(value);
  return normalized.length > 0 ? normalized : null;
}

function truncatePlainText(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
}

function normalizeManualIngestSourceLine(line) {
  return collapseWhitespace(
    stripSnippetListMarker(String(line ?? "").replace(/^>\s*/, "")),
  );
}

function formatManualIngestSourceType(sourceType) {
  return sourceType.replace(/_/g, " ");
}

function deriveManualIngestTitle(explicitTitle, sourceMaterial) {
  const normalizedTitle = normalizeOptionalText(explicitTitle);
  if (normalizedTitle) {
    return truncatePlainText(normalizedTitle, 90);
  }

  const firstSourceLine = sourceMaterial
    .split(/\r?\n/)
    .map(normalizeManualIngestSourceLine)
    .find(Boolean);

  return truncatePlainText(firstSourceLine ?? "Manual ingest", 90);
}

function normalizeManualIngestTags(tags) {
  if (tags == null) {
    return [];
  }

  if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string")) {
    throw new Error("tags must be an array of strings");
  }

  const normalizedTags = [];
  const seen = new Set();

  for (const tag of tags) {
    const normalizedTag = normalizeOptionalText(tag);
    if (!normalizedTag || seen.has(normalizedTag)) {
      continue;
    }

    seen.add(normalizedTag);
    normalizedTags.push(normalizedTag);
  }

  return normalizedTags;
}

function buildManualIngestSourcePreview(sourceMaterial) {
  const normalizedLines = sourceMaterial
    .split(/\r?\n/)
    .map(normalizeManualIngestSourceLine)
    .filter(Boolean);
  const rawPreviewLines = normalizedLines.slice(0, MANUAL_INGEST_PREVIEW_LINE_LIMIT);
  const previewLines = rawPreviewLines.map((line) =>
    truncatePlainText(line, MANUAL_INGEST_PREVIEW_LINE_MAX_LENGTH),
  );
  const truncated =
    normalizedLines.length > rawPreviewLines.length ||
    rawPreviewLines.some((line, index) => line !== previewLines[index]);

  return {
    source_line_count: normalizedLines.length,
    preview_lines: previewLines,
    truncated,
  };
}

function normalizeManualIngestArgs(args) {
  const normalizedArgs =
    args && typeof args === "object" && !Array.isArray(args) ? args : {};
  const sourceMaterial =
    typeof normalizedArgs.source_material === "string"
      ? normalizedArgs.source_material.trim()
      : "";

  if (!sourceMaterial) {
    throw new Error("source_material is required");
  }

  let sourceType = "note";
  if (normalizedArgs.source_type != null) {
    if (!MANUAL_INGEST_SOURCE_TYPES.includes(normalizedArgs.source_type)) {
      throw new Error(
        `source_type must be one of: ${MANUAL_INGEST_SOURCE_TYPES.join(", ")}`,
      );
    }

    sourceType = normalizedArgs.source_type;
  }

  let dryRun = false;
  if (normalizedArgs.dry_run != null) {
    if (typeof normalizedArgs.dry_run !== "boolean") {
      throw new Error("dry_run must be a boolean or null");
    }

    dryRun = normalizedArgs.dry_run;
  }

  return {
    title: deriveManualIngestTitle(normalizedArgs.title, sourceMaterial),
    source_material: sourceMaterial,
    source_type: sourceType,
    source_label: normalizeOptionalText(normalizedArgs.source_label),
    tags: normalizeManualIngestTags(normalizedArgs.tags),
    dry_run: dryRun,
  };
}

function buildManualIngestAppendArgs(normalizedArgs, timestamp) {
  const sourcePreview = buildManualIngestSourcePreview(normalizedArgs.source_material);
  const sourceTypeLabel = formatManualIngestSourceType(normalizedArgs.source_type);
  const bullets = [
    "Ingestion target: inbox/raw-notes.md",
    "Trust: low",
    "Promotion policy: review manually before moving anything into dynamic or core memory.",
    `Source type: ${sourceTypeLabel}`,
    `Captured source lines: ${sourcePreview.preview_lines.length} of ${sourcePreview.source_line_count}`,
  ];

  if (normalizedArgs.source_label) {
    bullets.push(`Source label: ${normalizedArgs.source_label}`);
  }

  sourcePreview.preview_lines.forEach((line, index) => {
    bullets.push(`Source excerpt ${index + 1}: ${line}`);
  });

  if (sourcePreview.truncated) {
    bullets.push("Source excerpt truncated: yes");
  }

  return {
    append_args: {
      file: "raw-notes",
      title: normalizedArgs.title,
      summary: normalizedArgs.source_label
        ? `Manual ingest from user-provided ${sourceTypeLabel}: ${normalizedArgs.source_label}.`
        : `Manual ingest from user-provided ${sourceTypeLabel}.`,
      bullets,
      source: `manual_ingest/${normalizedArgs.source_type}`,
      tags: [
        ...normalizedArgs.tags,
        "manual-ingest",
        normalizedArgs.source_type,
      ],
      timestamp,
    },
    source_preview: sourcePreview,
  };
}

function manualIngest(roots, args) {
  const normalizedArgs = normalizeManualIngestArgs(args);
  const timestamp = normalizedArgs.dry_run
    ? MANUAL_INGEST_PREVIEW_TIMESTAMP
    : new Date().toISOString();
  const { append_args, source_preview } = buildManualIngestAppendArgs(
    normalizedArgs,
    timestamp,
  );

  if (!normalizedArgs.dry_run) {
    appendMemoryEntry(roots, append_args);
  }

  return {
    mode: normalizedArgs.dry_run ? "dry_run" : "write",
    target_relative_path: "inbox/raw-notes.md",
    trust_level: "low",
    wrote_entry: !normalizedArgs.dry_run,
    source_type: normalizedArgs.source_type,
    source_label: normalizedArgs.source_label,
    title: normalizedArgs.title,
    summary: append_args.summary,
    tags: append_args.tags,
    source_line_count: source_preview.source_line_count,
    preview_line_count: source_preview.preview_lines.length,
    preview_truncated: source_preview.truncated,
    timestamp: normalizedArgs.dry_run ? null : timestamp,
    entry_preview: buildMemoryEntryLines(append_args).join("\n"),
  };
}

function formatManualIngestReport(report) {
  const lines = [
    "# Manual Ingest",
    `- Mode: ${report.mode}`,
    `- Target: ${report.target_relative_path}`,
    `- Trust: ${report.trust_level}`,
    `- Source type: ${formatManualIngestSourceType(report.source_type)}`,
    `- Title: ${report.title}`,
    `- Captured source lines: ${report.preview_line_count} of ${report.source_line_count}`,
    `- Writes to core or dynamic: no`,
  ];

  if (report.source_label) {
    lines.push(`- Source label: ${report.source_label}`);
  }

  if (report.tags.length > 0) {
    lines.push(`- Tags: ${report.tags.join(", ")}`);
  }

  if (report.preview_truncated) {
    lines.push("- Source preview truncated: yes");
  }

  lines.push(
    "",
    report.wrote_entry ? "## Result" : "## Preview",
    report.wrote_entry
      ? `Appended a low-trust manual-ingest entry to ${report.target_relative_path}.`
      : "Dry run only. No files were changed.",
  );

  if (report.timestamp) {
    lines.push(`- Timestamp: ${report.timestamp}`);
  }

  lines.push("", "## Entry Preview", "```markdown", report.entry_preview, "```");

  return lines.join("\n");
}

function normalizeMemoryEntryHeading(line) {
  if (typeof line !== "string") {
    return "";
  }

  return collapseWhitespace(line);
}

function normalizeMultilineText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTextList(items, fieldName) {
  if (items == null) {
    return [];
  }

  if (!Array.isArray(items) || items.some((item) => typeof item !== "string")) {
    throw new Error(`${fieldName} must be an array of strings`);
  }

  return items
    .map((item) => normalizeOptionalText(item))
    .filter(Boolean);
}

function parseMemoryEntryHeading(headingLine) {
  const normalizedHeading = normalizeMemoryEntryHeading(headingLine);
  const match = normalizedHeading.match(/^###\s+(\S+)\s+-\s+(.+)$/);

  if (!match) {
    return {
      heading_line: normalizedHeading,
      heading_reference: normalizedHeading.replace(/^###\s+/, ""),
      timestamp: null,
      title: normalizedHeading.replace(/^###\s+/, ""),
    };
  }

  return {
    heading_line: normalizedHeading,
    heading_reference: `${match[1]} - ${match[2]}`,
    timestamp: match[1],
    title: match[2],
  };
}

function normalizePromotionTargetHeading(value) {
  const normalizedHeading = normalizeOptionalText(value);
  if (!normalizedHeading) {
    return null;
  }

  return parseMemoryEntryHeading(normalizedHeading).heading_reference;
}

function extractMemoryEntryField(lines, label) {
  const prefix = `- ${label}:`;

  for (const line of lines) {
    if (!line.startsWith(prefix)) {
      continue;
    }

    return line.slice(prefix.length).trim();
  }

  return null;
}

function findRawNoteEntry(roots, sourceNoteHeading) {
  const normalizedHeading = normalizeMemoryEntryHeading(sourceNoteHeading);
  if (!normalizedHeading) {
    throw new Error("source_note_heading is required");
  }

  const rawNotesPath = resolveFilePath(roots, "inbox", "raw-notes.md");
  const rawNotesMarkdown = fs.readFileSync(rawNotesPath, "utf8");
  const { bodyLines, items } = listDynamicSectionItems(
    rawNotesMarkdown,
    "## Notes",
  );
  const matches = items.filter(
    (item) =>
      item.kind === "entry" &&
      normalizeMemoryEntryHeading(item.lines[0]) === normalizedHeading,
  );

  if (matches.length === 0) {
    throw new Error(
      `Source note heading not found in inbox/raw-notes.md: ${sourceNoteHeading}`,
    );
  }

  if (matches.length > 1) {
    throw new Error(
      `Source note heading is ambiguous in inbox/raw-notes.md: ${sourceNoteHeading}`,
    );
  }

  const matchedItem = matches[0];
  const parsedHeading = parseMemoryEntryHeading(matchedItem.lines[0]);
  const summary = extractMemoryEntryField(matchedItem.lines, "Summary");
  const tagsText = extractMemoryEntryField(matchedItem.lines, "Tags");

  return {
    relative_path: "inbox/raw-notes.md",
    raw_notes_markdown: rawNotesMarkdown,
    body_lines: bodyLines,
    matched_item: matchedItem,
    heading_line: parsedHeading.heading_line,
    heading_reference: parsedHeading.heading_reference,
    timestamp: parsedHeading.timestamp,
    title: parsedHeading.title,
    summary,
    source: extractMemoryEntryField(matchedItem.lines, "Source"),
    tags: tagsText
      ? tagsText
          .split(",")
          .map((tag) => normalizeOptionalText(tag))
          .filter(Boolean)
      : [],
    text: matchedItem.text,
  };
}

function findCoreUpdateProposalEntry(roots, proposalHeading) {
  const normalizedHeading = normalizeMemoryEntryHeading(proposalHeading);
  if (!normalizedHeading) {
    throw new Error("proposal_heading is required");
  }

  const proposalsPath = resolveFilePath(roots, "inbox", "core-update-proposals.md");
  const proposalsMarkdown = fs.readFileSync(proposalsPath, "utf8");
  const { items } = listDynamicSectionItems(
    proposalsMarkdown,
    "## Proposed Updates",
  );
  const matches = items.filter(
    (item) =>
      item.kind === "entry" &&
      normalizeMemoryEntryHeading(item.lines[0]) === normalizedHeading,
  );

  if (matches.length === 0) {
    throw new Error(
      `Proposal heading not found in inbox/core-update-proposals.md: ${proposalHeading}`,
    );
  }

  if (matches.length > 1) {
    throw new Error(
      `Proposal heading is ambiguous in inbox/core-update-proposals.md: ${proposalHeading}`,
    );
  }

  const matchedItem = matches[0];
  const parsedHeading = parseMemoryEntryHeading(matchedItem.lines[0]);

  return {
    relative_path: LINK_RAW_NOTE_TO_PROPOSAL_TARGET,
    heading_line: parsedHeading.heading_line,
    heading_reference: parsedHeading.heading_reference,
    timestamp: parsedHeading.timestamp,
    title: parsedHeading.title,
    summary: extractMemoryEntryField(matchedItem.lines, "Summary"),
    source: extractMemoryEntryField(matchedItem.lines, "Source"),
    tags: (() => {
      const tagsText = extractMemoryEntryField(matchedItem.lines, "Tags");
      return tagsText
        ? tagsText
            .split(",")
            .map((tag) => normalizeOptionalText(tag))
            .filter(Boolean)
        : [];
    })(),
    text: matchedItem.text,
  };
}

function buildSourceNoteProvenanceBullets(sourceNoteEntry) {
  const bullets = [
    `Source note: ${sourceNoteEntry.relative_path} :: ${sourceNoteEntry.heading_reference}`,
    `Source note remains in ${sourceNoteEntry.relative_path} for auditability.`,
  ];

  if (sourceNoteEntry.summary) {
    bullets.push(`Source note summary: ${sourceNoteEntry.summary}`);
  }

  if (sourceNoteEntry.source) {
    bullets.push(`Source note origin: ${sourceNoteEntry.source}`);
  }

  if (sourceNoteEntry.tags.length > 0) {
    bullets.push(`Source note tags: ${sourceNoteEntry.tags.join(", ")}`);
  }

  return bullets;
}

function normalizePromoteRawNoteArgs(args) {
  const normalizedArgs =
    args && typeof args === "object" && !Array.isArray(args) ? args : {};
  const sourceNoteHeading = normalizeMemoryEntryHeading(
    normalizedArgs.source_note_heading,
  );

  if (!sourceNoteHeading) {
    throw new Error("source_note_heading is required");
  }

  if (!PROMOTE_RAW_NOTE_DESTINATIONS.includes(normalizedArgs.destination)) {
    throw new Error(
      `destination must be one of: ${PROMOTE_RAW_NOTE_DESTINATIONS.join(", ")}`,
    );
  }

  let dryRun = false;
  if (normalizedArgs.dry_run != null) {
    if (typeof normalizedArgs.dry_run !== "boolean") {
      throw new Error("dry_run must be a boolean or null");
    }

    dryRun = normalizedArgs.dry_run;
  }

  const baseArgs = {
    source_note_heading: sourceNoteHeading,
    destination: normalizedArgs.destination,
    tags: normalizeManualIngestTags(normalizedArgs.tags),
    dry_run: dryRun,
  };

  if (normalizedArgs.destination === "recent_learning") {
    const promotedSummary = normalizeOptionalText(normalizedArgs.promoted_summary);
    if (!promotedSummary) {
      throw new Error(
        "promoted_summary is required when destination is recent_learning",
      );
    }

    const promotionRationale = normalizeOptionalText(
      normalizedArgs.promotion_rationale,
    );
    if (!promotionRationale) {
      throw new Error(
        "promotion_rationale is required when destination is recent_learning",
      );
    }

    return {
      ...baseArgs,
      promoted_title: normalizeOptionalText(normalizedArgs.promoted_title),
      promoted_summary: promotedSummary,
      promoted_bullets: normalizeTextList(
        normalizedArgs.promoted_bullets,
        "promoted_bullets",
      ),
      promotion_rationale: promotionRationale,
    };
  }

  if (!ALLOWED_CORE_FILES.has(normalizedArgs.target_file)) {
    throw new Error(
      "target_file is required when destination is core_update_proposal",
    );
  }

  const rationale = normalizeOptionalText(normalizedArgs.rationale);
  if (!rationale) {
    throw new Error(
      "rationale is required when destination is core_update_proposal",
    );
  }

  const proposedChanges = normalizeMultilineText(normalizedArgs.proposed_changes);
  if (!proposedChanges) {
    throw new Error(
      "proposed_changes is required when destination is core_update_proposal",
    );
  }

  return {
    ...baseArgs,
    target_file: normalizedArgs.target_file,
    rationale,
    proposed_changes: proposedChanges,
  };
}

function buildPromoteRawNoteAppendArgs(
  normalizedArgs,
  sourceNoteEntry,
  timestamp,
) {
  const sourceProvenanceBullets = buildSourceNoteProvenanceBullets(sourceNoteEntry);

  if (normalizedArgs.destination === "recent_learning") {
    return {
      target_relative_path: "dynamic/recent-learnings.md",
      append_args: {
        file: "recent-learnings",
        title: normalizedArgs.promoted_title ?? sourceNoteEntry.title,
        summary: normalizedArgs.promoted_summary,
        bullets: [
          `Promotion rationale: ${normalizedArgs.promotion_rationale}`,
          ...normalizedArgs.promoted_bullets,
          ...sourceProvenanceBullets,
        ],
        source: "promote_raw_note/recent_learning",
        tags: [
          ...normalizedArgs.tags,
          "manual-promotion",
          "recent-learning",
        ],
        timestamp,
      },
    };
  }

  return {
    target_relative_path: "inbox/core-update-proposals.md",
    append_args: {
      file: "core-update-proposals",
      title: normalizedArgs.target_file,
      summary: normalizedArgs.rationale,
      bullets: [
        "Proposed changes:",
        normalizedArgs.proposed_changes,
        ...sourceProvenanceBullets,
      ],
      source: "promote_raw_note/core_update_proposal",
      tags: [
        ...normalizedArgs.tags,
        "manual-promotion",
        "core-update-proposal",
        normalizedArgs.target_file,
      ],
      timestamp,
    },
  };
}

function promoteRawNote(roots, args) {
  const normalizedArgs = normalizePromoteRawNoteArgs(args);
  const sourceNoteEntry = findRawNoteEntry(roots, normalizedArgs.source_note_heading);
  const timestamp = normalizedArgs.dry_run
    ? MANUAL_INGEST_PREVIEW_TIMESTAMP
    : new Date().toISOString();
  const { target_relative_path, append_args } = buildPromoteRawNoteAppendArgs(
    normalizedArgs,
    sourceNoteEntry,
    timestamp,
  );

  if (!normalizedArgs.dry_run) {
    appendMemoryEntry(roots, append_args);
  }

  return {
    mode: normalizedArgs.dry_run ? "dry_run" : "write",
    destination: normalizedArgs.destination,
    target_relative_path,
    source_relative_path: sourceNoteEntry.relative_path,
    source_note_heading: sourceNoteEntry.heading_line,
    source_note_reference: sourceNoteEntry.heading_reference,
    source_note_summary: sourceNoteEntry.summary,
    source_note_remains_in_inbox: true,
    wrote_entry: !normalizedArgs.dry_run,
    timestamp: normalizedArgs.dry_run ? null : timestamp,
    tags: append_args.tags,
    entry_preview: buildMemoryEntryLines(append_args).join("\n"),
  };
}

function formatPromoteRawNoteReport(report) {
  const lines = [
    "# Promote Raw Note",
    `- Mode: ${report.mode}`,
    `- Destination: ${report.target_relative_path}`,
    `- Source note: ${report.source_relative_path} :: ${report.source_note_reference}`,
    `- Source note remains in inbox: ${
      report.source_note_remains_in_inbox ? "yes" : "no"
    }`,
    "- Writes to core directly: no",
  ];

  if (report.source_note_summary) {
    lines.push(`- Source note summary: ${report.source_note_summary}`);
  }

  if (report.tags.length > 0) {
    lines.push(`- Tags: ${report.tags.join(", ")}`);
  }

  lines.push(
    "",
    report.wrote_entry ? "## Result" : "## Preview",
    report.wrote_entry
      ? `Promoted the raw note into ${report.target_relative_path} while keeping the source note in inbox/raw-notes.md.`
      : "Dry run only. No files were changed.",
  );

  if (report.timestamp) {
    lines.push(`- Timestamp: ${report.timestamp}`);
  }

  lines.push("", "## Entry Preview", "```markdown", report.entry_preview, "```");

  return lines.join("\n");
}

function normalizeMarkRawNoteStatusArgs(args) {
  const normalizedArgs =
    args && typeof args === "object" && !Array.isArray(args) ? args : {};
  const sourceNoteHeading = normalizeMemoryEntryHeading(
    normalizedArgs.source_note_heading,
  );

  if (!sourceNoteHeading) {
    throw new Error("source_note_heading is required");
  }

  if (!MARK_RAW_NOTE_STATUS_VALUES.includes(normalizedArgs.status)) {
    throw new Error(
      `status must be one of: ${MARK_RAW_NOTE_STATUS_VALUES.join(", ")}`,
    );
  }

  let dryRun = false;
  if (normalizedArgs.dry_run != null) {
    if (typeof normalizedArgs.dry_run !== "boolean") {
      throw new Error("dry_run must be a boolean or null");
    }

    dryRun = normalizedArgs.dry_run;
  }

  const reviewNote = normalizeOptionalText(normalizedArgs.review_note);
  const promotionTargetRelativePath = normalizeOptionalText(
    normalizedArgs.promotion_target_relative_path,
  );
  const promotionTargetHeading = normalizePromotionTargetHeading(
    normalizedArgs.promotion_target_heading,
  );

  if (normalizedArgs.status === "promoted") {
    if (!MARK_RAW_NOTE_PROMOTION_TARGETS.includes(promotionTargetRelativePath)) {
      throw new Error(
        `promotion_target_relative_path must be one of: ${MARK_RAW_NOTE_PROMOTION_TARGETS.join(", ")}`,
      );
    }
  } else if (promotionTargetRelativePath || promotionTargetHeading) {
    throw new Error(
      "promotion_target_relative_path and promotion_target_heading are only allowed when status is promoted",
    );
  }

  return {
    source_note_heading: sourceNoteHeading,
    status: normalizedArgs.status,
    review_note: reviewNote,
    promotion_target_relative_path: promotionTargetRelativePath,
    promotion_target_heading: promotionTargetHeading,
    dry_run: dryRun,
  };
}

function normalizeLinkRawNoteToProposalArgs(args) {
  const normalizedArgs =
    args && typeof args === "object" && !Array.isArray(args) ? args : {};
  const sourceNoteHeading = normalizeMemoryEntryHeading(
    normalizedArgs.source_note_heading,
  );
  const proposalHeading = normalizeMemoryEntryHeading(
    normalizedArgs.proposal_heading,
  );

  if (!sourceNoteHeading) {
    throw new Error("source_note_heading is required");
  }

  if (!proposalHeading) {
    throw new Error("proposal_heading is required");
  }

  let dryRun = false;
  if (normalizedArgs.dry_run != null) {
    if (typeof normalizedArgs.dry_run !== "boolean") {
      throw new Error("dry_run must be a boolean or null");
    }

    dryRun = normalizedArgs.dry_run;
  }

  return {
    source_note_heading: sourceNoteHeading,
    proposal_heading: proposalHeading,
    review_note: normalizeOptionalText(normalizedArgs.review_note),
    dry_run: dryRun,
  };
}

function buildRawNoteStatusLines(normalizedArgs) {
  const statusLines = [];

  if (normalizedArgs.status === "reviewed") {
    statusLines.push("- Status: reviewed");
  } else {
    statusLines.push(
      `- Status: promoted to ${normalizedArgs.promotion_target_relative_path}`,
    );
    statusLines.push(
      normalizedArgs.promotion_target_heading
        ? `- Promotion target: ${normalizedArgs.promotion_target_relative_path} :: ${normalizedArgs.promotion_target_heading}`
        : `- Promotion target: ${normalizedArgs.promotion_target_relative_path}`,
    );
  }

  if (normalizedArgs.review_note) {
    statusLines.push(`- Review note: ${normalizedArgs.review_note}`);
  }

  return statusLines;
}

function buildMarkedRawNoteLines(entryLines, normalizedArgs) {
  const headingLine = entryLines[0];
  const bodyLines = entryLines.slice(1).filter(
    (line) =>
      !line.startsWith("- Status:") &&
      !line.startsWith("- Promotion target:") &&
      !line.startsWith("- Supports proposal:") &&
      !line.startsWith("- Review note:"),
  );
  const statusLines = buildRawNoteStatusLines(normalizedArgs);
  const summaryIndex = bodyLines.findIndex((line) => line.startsWith("- Summary:"));
  const insertionIndex = summaryIndex >= 0 ? summaryIndex + 1 : 0;

  return [
    headingLine,
    ...bodyLines.slice(0, insertionIndex),
    ...statusLines,
    ...bodyLines.slice(insertionIndex),
  ];
}

function buildLinkedRawNoteToProposalLines(
  entryLines,
  normalizedArgs,
  proposalEntry,
) {
  const headingLine = entryLines[0];
  const bodyLines = entryLines.slice(1).filter(
    (line) =>
      !line.startsWith("- Status:") &&
      !line.startsWith("- Promotion target:") &&
      !line.startsWith("- Supports proposal:") &&
      !line.startsWith("- Review note:"),
  );
  const summaryIndex = bodyLines.findIndex((line) => line.startsWith("- Summary:"));
  const insertionIndex = summaryIndex >= 0 ? summaryIndex + 1 : 0;
  const linkLines = [
    "- Status: reviewed",
    `- Supports proposal: ${proposalEntry.relative_path} :: ${proposalEntry.heading_reference}`,
  ];

  if (normalizedArgs.review_note) {
    linkLines.push(`- Review note: ${normalizedArgs.review_note}`);
  }

  return [
    headingLine,
    ...bodyLines.slice(0, insertionIndex),
    ...linkLines,
    ...bodyLines.slice(insertionIndex),
  ];
}

function markRawNoteStatus(roots, args) {
  const normalizedArgs = normalizeMarkRawNoteStatusArgs(args);
  const sourceNoteEntry = findRawNoteEntry(roots, normalizedArgs.source_note_heading);
  const updatedItemLines = buildMarkedRawNoteLines(
    sourceNoteEntry.matched_item.lines,
    normalizedArgs,
  );
  const nextBodyLines = normalizeSectionBodyLines([
    ...sourceNoteEntry.body_lines.slice(0, sourceNoteEntry.matched_item.start),
    ...updatedItemLines,
    ...sourceNoteEntry.body_lines.slice(sourceNoteEntry.matched_item.end),
  ]);
  const nextMarkdown = replaceMarkdownSectionLines(
    sourceNoteEntry.raw_notes_markdown,
    "## Notes",
    nextBodyLines.length > 0
      ? nextBodyLines
      : [getWritableSectionFallback("raw-notes", "## Notes")],
  );

  if (!normalizedArgs.dry_run) {
    fs.writeFileSync(
      resolveFilePath(roots, "inbox", "raw-notes.md"),
      nextMarkdown,
      "utf8",
    );
  }

  return {
    mode: normalizedArgs.dry_run ? "dry_run" : "write",
    source_relative_path: "inbox/raw-notes.md",
    source_note_heading: sourceNoteEntry.heading_line,
    source_note_reference: sourceNoteEntry.heading_reference,
    status: normalizedArgs.status,
    promotion_target_relative_path: normalizedArgs.promotion_target_relative_path,
    promotion_target_heading: normalizedArgs.promotion_target_heading,
    review_note: normalizedArgs.review_note,
    wrote_entry: !normalizedArgs.dry_run,
    updated_entry_preview: updatedItemLines.join("\n"),
  };
}

function formatMarkRawNoteStatusReport(report) {
  const lines = [
    "# Mark Raw Note Status",
    `- Mode: ${report.mode}`,
    `- Source note: ${report.source_relative_path} :: ${report.source_note_reference}`,
    `- Status: ${report.status}`,
    "- Writes outside inbox/raw-notes.md: no",
  ];

  if (report.promotion_target_relative_path) {
    lines.push(
      report.promotion_target_heading
        ? `- Promotion target: ${report.promotion_target_relative_path} :: ${report.promotion_target_heading}`
        : `- Promotion target: ${report.promotion_target_relative_path}`,
    );
  }

  if (report.review_note) {
    lines.push(`- Review note: ${report.review_note}`);
  }

  lines.push(
    "",
    report.wrote_entry ? "## Result" : "## Preview",
    report.wrote_entry
      ? "Updated the raw note status in inbox/raw-notes.md."
      : "Dry run only. No files were changed.",
    "",
    "## Updated Entry Preview",
    "```markdown",
    report.updated_entry_preview,
    "```",
  );

  return lines.join("\n");
}

function linkRawNoteToProposal(roots, args) {
  const normalizedArgs = normalizeLinkRawNoteToProposalArgs(args);
  const sourceNoteEntry = findRawNoteEntry(roots, normalizedArgs.source_note_heading);
  const proposalEntry = findCoreUpdateProposalEntry(
    roots,
    normalizedArgs.proposal_heading,
  );
  const updatedItemLines = buildLinkedRawNoteToProposalLines(
    sourceNoteEntry.matched_item.lines,
    normalizedArgs,
    proposalEntry,
  );
  const nextBodyLines = normalizeSectionBodyLines([
    ...sourceNoteEntry.body_lines.slice(0, sourceNoteEntry.matched_item.start),
    ...updatedItemLines,
    ...sourceNoteEntry.body_lines.slice(sourceNoteEntry.matched_item.end),
  ]);
  const nextMarkdown = replaceMarkdownSectionLines(
    sourceNoteEntry.raw_notes_markdown,
    "## Notes",
    nextBodyLines.length > 0
      ? nextBodyLines
      : [getWritableSectionFallback("raw-notes", "## Notes")],
  );

  if (!normalizedArgs.dry_run) {
    fs.writeFileSync(
      resolveFilePath(roots, "inbox", "raw-notes.md"),
      nextMarkdown,
      "utf8",
    );
  }

  return {
    mode: normalizedArgs.dry_run ? "dry_run" : "write",
    source_relative_path: "inbox/raw-notes.md",
    source_note_heading: sourceNoteEntry.heading_line,
    source_note_reference: sourceNoteEntry.heading_reference,
    proposal_relative_path: proposalEntry.relative_path,
    proposal_heading: proposalEntry.heading_line,
    proposal_reference: proposalEntry.heading_reference,
    proposal_summary: proposalEntry.summary,
    review_note: normalizedArgs.review_note,
    wrote_entry: !normalizedArgs.dry_run,
    updated_entry_preview: updatedItemLines.join("\n"),
  };
}

function formatLinkRawNoteToProposalReport(report) {
  const lines = [
    "# Link Raw Note To Proposal",
    `- Mode: ${report.mode}`,
    `- Source note: ${report.source_relative_path} :: ${report.source_note_reference}`,
    `- Existing proposal: ${report.proposal_relative_path} :: ${report.proposal_reference}`,
    "- Writes outside inbox/raw-notes.md: no",
    "- Existing proposal edited: no",
  ];

  if (report.proposal_summary) {
    lines.push(`- Proposal summary: ${report.proposal_summary}`);
  }

  if (report.review_note) {
    lines.push(`- Review note: ${report.review_note}`);
  }

  lines.push(
    "",
    report.wrote_entry ? "## Result" : "## Preview",
    report.wrote_entry
      ? "Updated the raw note so it clearly supports an existing proposal without creating a duplicate proposal entry."
      : "Dry run only. No files were changed.",
    "",
    "## Updated Entry Preview",
    "```markdown",
    report.updated_entry_preview,
    "```",
  );

  return lines.join("\n");
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

function getWritableFileKind(file) {
  return DYNAMIC_FILE_NAMES.includes(file) ? "dynamic" : "inbox";
}

function hasMarkdownSection(markdown, heading) {
  try {
    findSectionBounds(markdown, heading);
    return true;
  } catch {
    return false;
  }
}

function buildWritableSurfaceReport(roots, file) {
  const kind = getWritableFileKind(file);
  const relativePath = `${kind}/${file}.md`;
  const filePath = resolveFilePath(roots, kind, `${file}.md`);
  const markdown = fs.readFileSync(filePath, "utf8");
  const appendTarget = resolveAppendTargetSection(markdown, file);
  const replaceableSections =
    kind === "dynamic" ? listReplaceableDynamicSections(roots, file) : [];
  const allowedOperations =
    kind === "dynamic"
      ? ["append_entry", "replace_section", "maintain_item"]
      : ["append_entry"];

  let trackedItemCount = null;
  let healthState = "append_target_missing";

  if (appendTarget.appendTargetPresent && appendTarget.appendTargetSection) {
    const { items } = listDynamicSectionItems(
      markdown,
      appendTarget.appendTargetSection,
    );
    const fallbackText = normalizeDynamicItemText(
      getWritableSectionFallback(file, appendTarget.appendTargetSection),
    );
    trackedItemCount = items.filter((item) => item.text !== fallbackText).length;
    healthState =
      trackedItemCount === 0
        ? "scaffold_only"
        : trackedItemCount === 1
          ? "sparse"
          : "active";
  }

  return {
    relativePath,
    kind,
    allowedOperations,
    appendTargetSection: appendTarget.appendTargetSection,
    appendTargetPresent: appendTarget.appendTargetPresent,
    appendTargetResolution: appendTarget.appendTargetResolution,
    canonicalAppendTargetSection: appendTarget.canonicalAppendTargetSection,
    appendTargetCandidates: appendTarget.appendTargetCandidates,
    trackedItemCount,
    healthState,
    replaceableSections,
  };
}

function buildMemoryHealthSummary(writableSurfaces) {
  const byState = {
    active: 0,
    sparse: 0,
    scaffold_only: 0,
    append_target_missing: 0,
  };

  const scaffoldOnlyFiles = [];
  const sparseFiles = [];
  const appendTargetMissingFiles = [];

  for (const surface of writableSurfaces) {
    byState[surface.healthState] += 1;

    if (surface.healthState === "scaffold_only") {
      scaffoldOnlyFiles.push(surface.relativePath);
    }

    if (surface.healthState === "sparse") {
      sparseFiles.push(surface.relativePath);
    }

    if (surface.healthState === "append_target_missing") {
      appendTargetMissingFiles.push(surface.relativePath);
    }
  }

  return {
    byState,
    scaffoldOnlyFiles,
    sparseFiles,
    appendTargetMissingFiles,
  };
}

function buildStatusReport(contextRoot, roots) {
  const filesByKind = Object.fromEntries(
    MEMORY_KINDS.map((kind) => [kind, listRelativeMarkdownFiles(roots, kind)]),
  );
  const fileCounts = Object.fromEntries(
    MEMORY_KINDS.map((kind) => [kind, filesByKind[kind].length]),
  );
  const writableSurfaces = Array.from(WRITABLE_FILE_NAMES)
    .sort()
    .map((file) => buildWritableSurfaceReport(roots, file))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const writableFiles = writableSurfaces.map((surface) => surface.relativePath);
  const replaceableSections = writableSurfaces
    .filter((surface) => surface.kind === "dynamic")
    .map((surface) => ({
      relativePath: surface.relativePath,
      sections: surface.replaceableSections,
    }));

  return {
    contextRoot,
    filesByKind,
    fileCounts,
    writableFiles,
    writableSurfaces,
    memoryHealth: buildMemoryHealthSummary(writableSurfaces),
    replaceableSections,
    toolNames: [...TOOL_NAMES],
    retrieval: {
      mode: SEARCH_MODE,
      derivedIndexEnabled: false,
    },
  };
}

function formatStatusReport(report) {
  const scaffoldOnlyFiles =
    report.memoryHealth.scaffoldOnlyFiles.length > 0
      ? report.memoryHealth.scaffoldOnlyFiles.join(", ")
      : "none";
  const sparseFiles =
    report.memoryHealth.sparseFiles.length > 0
      ? report.memoryHealth.sparseFiles.join(", ")
      : "none";
  const appendTargetMissingFiles =
    report.memoryHealth.appendTargetMissingFiles.length > 0
      ? report.memoryHealth.appendTargetMissingFiles.join(", ")
      : "none";
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
    "## Memory Health",
    `- Active writable files: ${report.memoryHealth.byState.active}`,
    `- Sparse writable files: ${report.memoryHealth.byState.sparse}`,
    `- Scaffold-only writable files: ${report.memoryHealth.byState.scaffold_only}`,
    `- Write-boundary issues: ${report.memoryHealth.byState.append_target_missing}`,
    `- Scaffold-only file paths: ${scaffoldOnlyFiles}`,
    `- Sparse file paths: ${sparseFiles}`,
    `- Append-target-missing file paths: ${appendTargetMissingFiles}`,
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

  lines.push("", "## Writable Surfaces");
  for (const [index, surface] of report.writableSurfaces.entries()) {
    const appendTargetSummary = surface.appendTargetSection
      ? `${surface.appendTargetSection}${surface.appendTargetPresent ? "" : " (missing)"}`
      : "none";
    const appendTargetResolutionSummary =
      surface.appendTargetResolution === "alias"
        ? `alias of ${surface.canonicalAppendTargetSection}`
        : surface.appendTargetResolution;
    const trackedItemSummary =
      surface.trackedItemCount === null ? "unavailable" : String(surface.trackedItemCount);
    const healthSummary =
      surface.healthState === "append_target_missing"
        ? "append target missing"
        : surface.healthState.replaceAll("_", " ");
    const replaceableSectionsSummary =
      surface.replaceableSections.length > 0
        ? surface.replaceableSections.join(", ")
        : "none";

    lines.push(`${index + 1}. ${surface.relativePath}`);
    lines.push(`   Health: ${healthSummary}`);
    lines.push(`   Append target section: ${appendTargetSummary}`);
    lines.push(`   Append target resolution: ${appendTargetResolutionSummary}`);
    lines.push(`   Tracked items in append section: ${trackedItemSummary}`);
    lines.push(`   Allowed operations: ${surface.allowedOperations.join(", ")}`);
    lines.push(`   Replaceable sections: ${replaceableSectionsSummary}`);
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

function normalizeSearchReasonCodes(reasonCodes) {
  const seen = new Set(reasonCodes.filter(Boolean));
  return SEARCH_REASON_CODE_ORDER.filter((code) => seen.has(code));
}

function sortMatchedInLocations(matchedIn) {
  const seen = new Set(matchedIn);
  return SEARCH_MATCH_LOCATION_ORDER.filter((location) => seen.has(location));
}

function formatSearchMatchLocations(matchedIn) {
  const orderedLocations = sortMatchedInLocations(matchedIn);

  if (orderedLocations.length === 0) {
    return "the file";
  }

  if (orderedLocations.length === 1) {
    return orderedLocations[0];
  }

  if (orderedLocations.length === 2) {
    return `${orderedLocations[0]} and ${orderedLocations[1]}`;
  }

  return `${orderedLocations[0]}, ${orderedLocations[1]}, and ${orderedLocations[2]}`;
}

function buildSearchReasonSummary({ matchedIn, matchedTerms, reasonCodes }, terms) {
  const locations = formatSearchMatchLocations(matchedIn);

  let summary;
  if (terms.length <= 1 || matchedTerms.length === 0) {
    summary = `Matched the query in ${locations}.`;
  } else if (matchedTerms.length === terms.length) {
    summary = `Matched all ${terms.length} query terms in ${locations}.`;
  } else {
    summary = `Matched ${matchedTerms.length} of ${terms.length} query terms in ${locations}.`;
  }

  if (reasonCodes.includes("downranked_noise")) {
    summary += " Low-signal template or title noise reduced its score.";
  }

  return summary;
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

function stripSnippetListMarker(line) {
  return line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "");
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

function headingPathsEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((segment, index) => segment === right[index]);
}

function headingPathStartsWith(headingPath, prefix) {
  if (prefix.length > headingPath.length) {
    return false;
  }

  return prefix.every((segment, index) => headingPath[index] === segment);
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
  let lastHeadingBlock = null;

  const flushContent = () => {
    const trimmedLines = trimBlankLines(currentLines.map((line) => line.trim()));
    if (trimmedLines.length === 0) {
      currentLines = [];
      return;
    }

    const currentHeadingPath = headingPath.filter(Boolean);

    blocks.push({
      kind: "content",
      headingPath: currentHeadingPath,
      lines: trimmedLines,
      text: trimmedLines.join("\n"),
    });

    if (
      lastHeadingBlock &&
      headingPathsEqual(lastHeadingBlock.headingPath, currentHeadingPath)
    ) {
      lastHeadingBlock.associatedContentLines.push(...trimmedLines);
    }

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
      lastHeadingBlock = {
        kind: "heading",
        headingPath: headingPath.filter(Boolean),
        lines: [headingTitle],
        text: headingPath.filter(Boolean).join(" / "),
        associatedContentLines: [],
      };
      blocks.push(lastHeadingBlock);
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

  const reasonCodes = [];
  if (terms.length > 1 && matchedTerms.size === terms.length) {
    reasonCodes.push("matched_all_terms");
  }

  if (matchedIn.has("content")) {
    reasonCodes.push("content_match");
  }

  if (matchedIn.has("heading")) {
    reasonCodes.push("heading_match");
  }

  if (matchedIn.has("path")) {
    reasonCodes.push("path_match");
  }

  if (isLowSignalSection || allLinesLowSignal || isTimestampedEntryHeading) {
    reasonCodes.push("downranked_noise");
  }

  return {
    score: Math.max(score, 0),
    matchedTerms: terms.filter((term) => matchedTerms.has(term)),
    matchedIn: sortMatchedInLocations(Array.from(matchedIn)),
    reasonCodes: normalizeSearchReasonCodes(reasonCodes),
  };
}

function pickSnippetLine(lines, phrase, terms) {
  let bestLine = lines[0] ?? "";
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const rawLine of lines) {
    const line = stripSnippetListMarker(collapseWhitespace(rawLine));
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

function lineHasSnippetSignal(line, phrase, terms) {
  const normalizedLine = line.toLowerCase();
  if (phrase && normalizedLine.includes(phrase)) {
    return true;
  }

  return terms.some((term) => normalizedLine.includes(term));
}

function buildSearchSnippet(relativePath, block, phrase, terms) {
  if (block.kind === "metadata") {
    return `File match: ${relativePath}`;
  }

  if (block.kind === "heading") {
    const substantiveLines = (block.associatedContentLines ?? []).filter(
      (line) => !isLowSignalLine(line),
    );
    const previewCandidates =
      substantiveLines.length > 0 ? substantiveLines : block.associatedContentLines ?? [];
    const previewLine = pickSnippetLine(
      previewCandidates,
      phrase,
      terms,
    );
    const fallbackPreviewLine =
      substantiveLines.length > 0 ? stripSnippetListMarker(collapseWhitespace(substantiveLines[0])) : "";
    const resolvedPreviewLine =
      previewLine && lineHasSnippetSignal(previewLine, phrase, terms)
        ? previewLine
        : fallbackPreviewLine || previewLine;

    if (resolvedPreviewLine) {
      return `Section match: ${formatSectionPath(block.headingPath)} - ${trimSnippet(resolvedPreviewLine)}`;
    }

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

function isPathOnlySearchResult(result) {
  return result.matchedIn.length === 1 && result.matchedIn[0] === "path";
}

function compareSearchResults(left, right) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  const pathOrder = left.relativePath.localeCompare(right.relativePath);
  if (pathOrder !== 0) {
    return pathOrder;
  }

  return left.sectionPath.localeCompare(right.sectionPath);
}

function suppressFileLocalPathOnlyResults(results) {
  let suppressedCount = 0;
  const resultsByFile = new Map();

  for (const result of results) {
    const fileResults = resultsByFile.get(result.relativePath) ?? [];
    fileResults.push(result);
    resultsByFile.set(result.relativePath, fileResults);
  }

  const filteredResults = [];
  for (const fileResults of resultsByFile.values()) {
    const specificMatches = fileResults.filter(
      (result) => !isPathOnlySearchResult(result),
    );
    if (specificMatches.length > 0) {
      suppressedCount += fileResults.length - specificMatches.length;
      filteredResults.push(...specificMatches);
      continue;
    }

    const sortedPathOnlyMatches = [...fileResults].sort(compareSearchResults);
    filteredResults.push(sortedPathOnlyMatches[0]);
    suppressedCount += Math.max(0, sortedPathOnlyMatches.length - 1);
  }

  return {
    filteredResults,
    suppressedCount,
  };
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
        reasonCodes: scored.reasonCodes,
        reasonSummary: buildSearchReasonSummary(scored, terms),
        snippet: buildSearchSnippet(record.relativePath, block, phrase, terms),
      };
      const resultKey = `${record.relativePath}::${sectionPath}`;
      const existing = sectionMatches.get(resultKey);

      if (shouldReplaceSearchResult(existing, result)) {
        sectionMatches.set(resultKey, result);
      }
    }
  }

  const { filteredResults, suppressedCount } = suppressFileLocalPathOnlyResults(
    Array.from(sectionMatches.values()),
  );
  const sortedResults = filteredResults.sort(compareSearchResults);
  const limit = Math.max(1, Math.min(max_results, 20));

  return {
    query: normalizedQuery,
    totalMatches: sortedResults.length,
    suppressedPathOnlyResults: suppressedCount,
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

  if (report.suppressedPathOnlyResults > 0) {
    lines.push(
      `- Suppressed low-value path-only fallbacks: ${report.suppressedPathOnlyResults}`,
    );
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
      `- Why it ranked: ${result.reasonSummary}`,
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
  return normalizeOptionalText(value);
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

function buildDelegatedWakeUpArgs(args, defaultTask) {
  const normalizedArgs =
    args && typeof args === "object" && !Array.isArray(args) ? args : {};
  const task = normalizeOptionalWakeUpText(normalizedArgs.task) ?? defaultTask;

  return {
    ...normalizedArgs,
    task,
  };
}

function buildDelegatedWakeUpOptions(args, defaultTask, options = {}) {
  const normalizedArgs =
    args && typeof args === "object" && !Array.isArray(args) ? args : {};
  const explicitTask = normalizeOptionalWakeUpText(normalizedArgs.task);

  if (!options.prepend_default_task_to_query || !explicitTask) {
    return {};
  }

  const normalizedDefaultTask = normalizeOptionalWakeUpText(defaultTask);
  if (!normalizedDefaultTask) {
    return {};
  }

  if (explicitTask.toLowerCase().includes(normalizedDefaultTask.toLowerCase())) {
    return {};
  }

  return {
    search_query_prefix: normalizedDefaultTask,
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

function buildWakeUpContextReport(roots, args, options = {}) {
  const normalized = normalizeWakeUpContextArgs(args);
  const searchQuery = [
    normalizeOptionalWakeUpText(options.search_query_prefix),
    normalized.search_query,
  ]
    .filter(Boolean)
    .join(" ");
  const searchReport = findMemoryMatches(roots, {
    query: searchQuery,
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
    search_query: searchQuery,
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

function buildWakeUpPreviewTextFromLines(lines, maxLines = 2) {
  const previewLines = lines
    .filter((line) => !isLowSignalLine(line))
    .map((line) => trimSnippet(stripSnippetListMarker(collapseWhitespace(line))))
    .filter(Boolean)
    .slice(0, maxLines);

  return previewLines.join("; ");
}

function buildWakeUpDescendantPreviewText(blocks, targetHeadingPath, maxLines = 2) {
  const childPreviews = [];
  const seenChildren = new Set();

  for (const block of blocks) {
    if (block.kind !== "content") {
      continue;
    }

    const normalizedHeadingPath = block.headingPath.map(normalizeDisplayHeading);
    if (
      !headingPathStartsWith(normalizedHeadingPath, targetHeadingPath) ||
      normalizedHeadingPath.length <= targetHeadingPath.length
    ) {
      continue;
    }

    const childHeading = normalizedHeadingPath[targetHeadingPath.length];
    if (!childHeading || seenChildren.has(childHeading)) {
      continue;
    }

    const previewText = buildWakeUpPreviewTextFromLines(block.lines, 1);
    if (!previewText) {
      continue;
    }

    childPreviews.push(`${childHeading}: ${previewText}`);
    seenChildren.add(childHeading);

    if (childPreviews.length >= maxLines) {
      break;
    }
  }

  return childPreviews.join("; ");
}

function buildWakeUpSectionPreview(markdown, relativePath, sectionPath) {
  const blocks = parseMarkdownBlocks(markdown, relativePath);
  const targetHeadingPath =
    sectionPath === "Document" ? [] : sectionPath.split(" / ");

  if (targetHeadingPath.length === 0) {
    return "";
  }

  const exactContentLines = [];
  for (const block of blocks) {
    if (block.kind !== "content") {
      continue;
    }

    const normalizedHeadingPath = block.headingPath.map(normalizeDisplayHeading);
    if (headingPathsEqual(normalizedHeadingPath, targetHeadingPath)) {
      exactContentLines.push(...block.lines);
    }
  }

  const directPreview = buildWakeUpPreviewTextFromLines(exactContentLines);
  if (directPreview) {
    return directPreview;
  }

  return buildWakeUpDescendantPreviewText(blocks, targetHeadingPath);
}

function buildWakeUpReadFirstSections(roots, report) {
  const anchorItem = report.items[0];
  if (!anchorItem) {
    return [];
  }

  const sectionPaths = [];
  const isCoveredByExistingSection = (sectionPath) =>
    sectionPaths.some(
      (existingSectionPath) =>
        sectionPath === existingSectionPath ||
        sectionPath.startsWith(`${existingSectionPath} /`),
    );
  const pushSectionPath = (sectionPath) => {
    if (!sectionPath || isCoveredByExistingSection(sectionPath)) {
      return;
    }

    sectionPaths.push(sectionPath);
  };

  for (const item of report.items) {
    if (item.relative_path === anchorItem.relative_path) {
      pushSectionPath(item.section_path);
    }
  }

  for (const nextRead of report.next_reads) {
    if (
      nextRead.relative_path === anchorItem.relative_path &&
      nextRead.reason_not_selected === "same_file_cap"
    ) {
      pushSectionPath(nextRead.section_path);
    }
  }

  for (const nextRead of report.next_reads) {
    if (nextRead.relative_path === anchorItem.relative_path) {
      pushSectionPath(nextRead.section_path);
    }
  }

  const { kind, fileName } = parseRelativePath(anchorItem.relative_path);
  const markdown = fs.readFileSync(resolveFilePath(roots, kind, fileName), "utf8");

  return sectionPaths.slice(0, 3).map((sectionPath) => ({
    sectionPath,
    preview: buildWakeUpSectionPreview(markdown, anchorItem.relative_path, sectionPath),
  }));
}

function formatWakeUpSectionLabel(sectionPath) {
  const segments = sectionPath.split(" / ").filter(Boolean);
  return segments.at(-1) ?? sectionPath;
}

function appendWakeUpMetadata(lines, report, { includeAnchor = false } = {}) {
  lines.push(`- Task: ${report.task}`);

  if (report.project) {
    lines.push(`- Project: ${report.project}`);
  }

  if (report.goal) {
    lines.push(`- Goal: ${report.goal}`);
  }

  if (includeAnchor && report.items[0]) {
    lines.push(`- Durable anchor: ${report.items[0].relative_path}`);
  }

  lines.push(`- Included kinds: ${report.applied_kinds.join(", ")}`);
  lines.push(`- Bundle size: ${report.items.length} of ${report.max_items}`);
}

function appendWakeUpReadFirst(lines, report, readFirstSections) {
  if (readFirstSections.length === 0 || !report.items[0]) {
    return;
  }

  lines.push(
    "## Read First",
    `- File: ${report.items[0].relative_path}`,
    ...readFirstSections.map(({ sectionPath, preview }) =>
      preview
        ? `- ${sectionPath}: ${preview}`
        : `- ${sectionPath}`,
    ),
    "",
  );
}

function appendWakeUpRankedContext(
  lines,
  report,
  { heading = "## Ranked Context", compact = false } = {},
) {
  lines.push(heading);

  if (report.items.length === 0) {
    lines.push("No items selected.");
    return;
  }

  for (const item of report.items) {
    if (compact) {
      lines.push(
        `${item.rank}. ${item.relative_path} :: ${item.section_path}`,
        `- Why included: ${item.reason_summary}`,
        `- Evidence: ${item.kind}/${item.trust_level}; matched in ${item.matched_in.join(", ")}; adjusted ${item.adjusted_score}`,
        `- Snippet: ${item.snippet}`,
      );
      continue;
    }

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

function appendWakeUpNextReads(lines, report) {
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
}

function appendWakeUpWarnings(lines, report) {
  if (report.warnings.length > 0) {
    lines.push("", "## Warnings");
    for (const warning of report.warnings) {
      lines.push(`- ${warning.code}: ${warning.message}`);
    }
  }
}

function formatWakeUpContextReport(roots, report) {
  const readFirstSections = buildWakeUpReadFirstSections(roots, report);
  const lines = ["# Wake Up Context"];

  appendWakeUpMetadata(lines, report);
  lines.push("", "## Orientation", report.summary, "");
  appendWakeUpReadFirst(lines, report, readFirstSections);
  appendWakeUpRankedContext(lines, report);
  appendWakeUpNextReads(lines, report);
  appendWakeUpWarnings(lines, report);

  return lines.join("\n");
}

function formatWrapperContextReport(roots, report, title) {
  const readFirstSections = buildWakeUpReadFirstSections(roots, report);
  const lines = [`# ${title}`];

  appendWakeUpMetadata(lines, report, { includeAnchor: true });
  lines.push("", "## Answer Handoff");

  if (readFirstSections.length === 0) {
    lines.push(`- ${report.summary}`);
  } else {
    lines.push(`- Start with ${report.items[0].relative_path}.`);
    for (const { sectionPath, preview } of readFirstSections) {
      const label = formatWakeUpSectionLabel(sectionPath);
      lines.push(
        preview ? `- ${label}: ${preview}` : `- ${label}: ${sectionPath}`,
      );
    }
  }

  lines.push("", "## Orientation", report.summary, "");
  appendWakeUpReadFirst(lines, report, readFirstSections);
  appendWakeUpRankedContext(lines, report, {
    heading: "## Diagnostic Bundle",
    compact: true,
  });
  appendWakeUpNextReads(lines, report);
  appendWakeUpWarnings(lines, report);

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
    manualIngest(args) {
      return manualIngest(roots, args);
    },
    manualIngestText(args) {
      return formatManualIngestReport(manualIngest(roots, args));
    },
    promoteRawNote(args) {
      return promoteRawNote(roots, args);
    },
    promoteRawNoteText(args) {
      return formatPromoteRawNoteReport(promoteRawNote(roots, args));
    },
    markRawNoteStatus(args) {
      return markRawNoteStatus(roots, args);
    },
    markRawNoteStatusText(args) {
      return formatMarkRawNoteStatusReport(markRawNoteStatus(roots, args));
    },
    linkRawNoteToProposal(args) {
      return linkRawNoteToProposal(roots, args);
    },
    linkRawNoteToProposalText(args) {
      return formatLinkRawNoteToProposalReport(linkRawNoteToProposal(roots, args));
    },
    appendMemoryEntry(args) {
      return appendMemoryEntry(roots, args);
    },
    maintainDynamicItem(args) {
      return maintainDynamicItem(roots, args);
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
    writingStyleContext(args) {
      return buildWakeUpContextReport(
        roots,
        buildDelegatedWakeUpArgs(args, WRITING_STYLE_CONTEXT_DEFAULT_TASK),
        buildDelegatedWakeUpOptions(args, WRITING_STYLE_CONTEXT_DEFAULT_TASK, {
          prepend_default_task_to_query: true,
        }),
      );
    },
    writingStyleContextText(args) {
      return formatWrapperContextReport(
        roots,
        buildWakeUpContextReport(
          roots,
          buildDelegatedWakeUpArgs(args, WRITING_STYLE_CONTEXT_DEFAULT_TASK),
          buildDelegatedWakeUpOptions(args, WRITING_STYLE_CONTEXT_DEFAULT_TASK, {
            prepend_default_task_to_query: true,
          }),
        ),
        "Writing Style Context",
      );
    },
    productPositioningContext(args) {
      return buildWakeUpContextReport(
        roots,
        buildDelegatedWakeUpArgs(args, PRODUCT_POSITIONING_CONTEXT_DEFAULT_TASK),
      );
    },
    productPositioningContextText(args) {
      return formatWrapperContextReport(
        roots,
        buildWakeUpContextReport(
          roots,
          buildDelegatedWakeUpArgs(args, PRODUCT_POSITIONING_CONTEXT_DEFAULT_TASK),
        ),
        "Product Positioning Context",
      );
    },
    outboundFramingContext(args) {
      return buildWakeUpContextReport(
        roots,
        buildDelegatedWakeUpArgs(args, OUTBOUND_FRAMING_CONTEXT_DEFAULT_TASK),
      );
    },
    outboundFramingContextText(args) {
      return formatWrapperContextReport(
        roots,
        buildWakeUpContextReport(
          roots,
          buildDelegatedWakeUpArgs(args, OUTBOUND_FRAMING_CONTEXT_DEFAULT_TASK),
        ),
        "Outbound Framing Context",
      );
    },
    wakeUpContext(args) {
      return buildWakeUpContextReport(roots, args);
    },
    wakeUpContextText(args) {
      return formatWakeUpContextReport(roots, buildWakeUpContextReport(roots, args));
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

  const wakeUpInputSchema = {
    task: z.string().optional(),
    project: z.string().nullable().optional(),
    goal: z.string().nullable().optional(),
    max_items: z.number().nullable().optional(),
    include_inbox: z.boolean().nullable().optional(),
  };

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
          .describe("Relative path like core/product-and-positioning.md")
          .optional(),
        path: z
          .string()
          .regex(/^(core|dynamic|inbox)\/[A-Za-z0-9._-]+\.md$/)
          .describe("Alias for relative_path; prefer relative_path")
          .optional(),
      },
    },
    async (args = {}) => {
      const relative_path = normalizeReadMemoryFileArgs(args);
      const { relativePath, text } = runtime.readMemoryFile(relative_path);
      return textResult(`# ${relativePath}\n\n${text}`);
    },
  );

  server.registerTool(
    "writing_style_context",
    {
      description:
        WRITING_STYLE_CONTEXT_TOOL_DESCRIPTION,
      inputSchema: wakeUpInputSchema,
    },
    async (args = {}) => textResult(runtime.writingStyleContextText(args ?? {})),
  );

  server.registerTool(
    "product_positioning_context",
    {
      description:
        PRODUCT_POSITIONING_CONTEXT_TOOL_DESCRIPTION,
      inputSchema: wakeUpInputSchema,
    },
    async (args = {}) =>
      textResult(runtime.productPositioningContextText(args ?? {})),
  );

  server.registerTool(
    "outbound_framing_context",
    {
      description:
        OUTBOUND_FRAMING_CONTEXT_TOOL_DESCRIPTION,
      inputSchema: wakeUpInputSchema,
    },
    async (args = {}) => textResult(runtime.outboundFramingContextText(args ?? {})),
  );

  server.registerTool(
    "search_memory",
    {
      description:
        SEARCH_MEMORY_TOOL_DESCRIPTION,
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
        WAKE_UP_CONTEXT_TOOL_DESCRIPTION,
      inputSchema: wakeUpInputSchema,
    },
    async (args = {}) => textResult(runtime.wakeUpContextText(args ?? {})),
  );

  server.registerTool(
    "manual_ingest",
    {
      description:
        MANUAL_INGEST_TOOL_DESCRIPTION,
      inputSchema: {
        source_material: z.string().min(1),
        title: z.string().nullable().optional(),
        source_type: z.enum(MANUAL_INGEST_SOURCE_TYPES).nullable().optional(),
        source_label: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
        dry_run: z.boolean().nullable().optional(),
      },
    },
    async (args = {}) => textResult(runtime.manualIngestText(args ?? {})),
  );

  server.registerTool(
    "promote_raw_note",
    {
      description:
        PROMOTE_RAW_NOTE_TOOL_DESCRIPTION,
      inputSchema: {
        source_note_heading: z.string().min(1),
        destination: z.enum(PROMOTE_RAW_NOTE_DESTINATIONS),
        promoted_title: z.string().nullable().optional(),
        promoted_summary: z.string().nullable().optional(),
        promoted_bullets: z.array(z.string()).optional(),
        promotion_rationale: z.string().nullable().optional(),
        target_file: z
          .enum([
            "identity",
            "product-and-positioning",
            "communication-style",
            "outbound-playbook",
            "agent-rules",
          ])
          .nullable()
          .optional(),
        rationale: z.string().nullable().optional(),
        proposed_changes: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
        dry_run: z.boolean().nullable().optional(),
      },
    },
    async (args = {}) => textResult(runtime.promoteRawNoteText(args ?? {})),
  );

  server.registerTool(
    "mark_raw_note_status",
    {
      description:
        MARK_RAW_NOTE_STATUS_TOOL_DESCRIPTION,
      inputSchema: {
        source_note_heading: z.string().min(1),
        status: z.enum(MARK_RAW_NOTE_STATUS_VALUES),
        review_note: z.string().nullable().optional(),
        promotion_target_relative_path: z
          .enum(MARK_RAW_NOTE_PROMOTION_TARGETS)
          .nullable()
          .optional(),
        promotion_target_heading: z.string().nullable().optional(),
        dry_run: z.boolean().nullable().optional(),
      },
    },
    async (args = {}) => textResult(runtime.markRawNoteStatusText(args ?? {})),
  );

  server.registerTool(
    "link_raw_note_to_proposal",
    {
      description:
        LINK_RAW_NOTE_TO_PROPOSAL_TOOL_DESCRIPTION,
      inputSchema: {
        source_note_heading: z.string().min(1),
        proposal_heading: z.string().min(1),
        review_note: z.string().nullable().optional(),
        dry_run: z.boolean().nullable().optional(),
      },
    },
    async (args = {}) =>
      textResult(runtime.linkRawNoteToProposalText(args ?? {})),
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
    "maintain_dynamic_item",
    {
      description:
        "Replace or remove one exact markdown bullet or dated ### entry inside an allowed top-level section of a dynamic file. This fails on ambiguity instead of guessing.",
      inputSchema: {
        file: z.enum([
          "current-priorities",
          "active-campaigns",
          "recent-learnings",
          "message-tests",
          "account-patterns",
        ]),
        section_heading: z.string(),
        match_text: z.string().min(1),
        operation: z.enum(["replace", "remove"]),
        replacement_text: z.string().optional(),
      },
    },
    async (args) => textResult(runtime.maintainDynamicItem(args)),
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
