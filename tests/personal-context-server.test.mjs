import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createPersonalContextRuntime,
  LINK_RAW_NOTE_TO_PROPOSAL_TOOL_DESCRIPTION,
  MANUAL_INGEST_TOOL_DESCRIPTION,
  MARK_RAW_NOTE_STATUS_TOOL_DESCRIPTION,
  PROMOTE_RAW_NOTE_TOOL_DESCRIPTION,
  normalizeReadMemoryFileArgs,
  OUTBOUND_FRAMING_CONTEXT_TOOL_DESCRIPTION,
  PRODUCT_POSITIONING_CONTEXT_TOOL_DESCRIPTION,
  SEARCH_MEMORY_TOOL_DESCRIPTION,
  SERVER_INSTRUCTIONS,
  WAKE_UP_CONTEXT_TOOL_DESCRIPTION,
  WRITING_STYLE_CONTEXT_TOOL_DESCRIPTION,
} from "../lib/personal-context-server.mjs";

function createTempContextRoot(t) {
  const contextRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "personal-context-runtime-"),
  );
  t.after(() => {
    fs.rmSync(contextRoot, { recursive: true, force: true });
  });
  return contextRoot;
}

function writeMemoryFile(contextRoot, relativePath, markdown) {
  const filePath = path.join(contextRoot, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, markdown, "utf8");
}

function buildMarkdown(title, sections) {
  const lines = [`# ${title}`, ""];

  for (const { heading, lines: sectionLines } of sections) {
    lines.push(`## ${heading}`);
    lines.push(...sectionLines);
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function createRuntimeWithFiles(t, files = {}) {
  const contextRoot = createTempContextRoot(t);
  const runtime = createPersonalContextRuntime({ contextRoot });

  for (const [relativePath, markdown] of Object.entries(files)) {
    writeMemoryFile(contextRoot, relativePath, markdown);
  }

  return { contextRoot, runtime };
}

function warningCodes(report) {
  return report.warnings.map((warning) => warning.code);
}

test("status reports scaffolded files, write boundaries, and capabilities", (t) => {
  const contextRoot = createTempContextRoot(t);
  const runtime = createPersonalContextRuntime({ contextRoot });

  const report = runtime.getStatusReport();
  const text = runtime.getStatusText();
  const currentPrioritiesSurface = report.writableSurfaces.find(
    (item) => item.relativePath === "dynamic/current-priorities.md",
  );

  assert.equal(report.fileCounts.core, 0);
  assert.equal(report.fileCounts.dynamic, 5);
  assert.equal(report.fileCounts.inbox, 2);
  assert.deepEqual(report.memoryHealth.byState, {
    active: 0,
    sparse: 0,
    scaffold_only: 7,
    append_target_missing: 0,
  });
  assert.ok(report.toolNames.includes("status"));
  assert.ok(report.toolNames.includes("search_memory"));
  assert.ok(report.toolNames.includes("maintain_dynamic_item"));
  assert.ok(report.toolNames.includes("wake_up_context"));
  assert.ok(report.toolNames.includes("writing_style_context"));
  assert.ok(report.toolNames.includes("product_positioning_context"));
  assert.ok(report.toolNames.includes("outbound_framing_context"));
  assert.ok(report.toolNames.includes("manual_ingest"));
  assert.ok(report.toolNames.includes("promote_raw_note"));
  assert.ok(report.toolNames.includes("mark_raw_note_status"));
  assert.ok(report.toolNames.includes("link_raw_note_to_proposal"));
  assert.ok(report.writableFiles.includes("dynamic/current-priorities.md"));
  assert.ok(report.writableFiles.includes("inbox/raw-notes.md"));
  assert.deepEqual(currentPrioritiesSurface?.allowedOperations, [
    "append_entry",
    "replace_section",
    "maintain_item",
  ]);
  assert.equal(currentPrioritiesSurface?.appendTargetSection, "## Active Priorities");
  assert.equal(currentPrioritiesSurface?.appendTargetPresent, true);
  assert.equal(currentPrioritiesSurface?.appendTargetResolution, "canonical");
  assert.equal(currentPrioritiesSurface?.trackedItemCount, 0);
  assert.equal(currentPrioritiesSurface?.healthState, "scaffold_only");
  assert.match(text, /# Personal Context Status/);
  assert.match(text, /## Memory Health/);
  assert.match(text, /Scaffold-only writable files: 7/);
  assert.match(text, /dynamic\/recent-learnings\.md/);
  assert.match(text, /search_memory/);
  assert.match(text, /wake_up_context/);
});

test("runtime instructions and tool descriptions steer primary durable prompts through wrapper tools first", (t) => {
  const contextRoot = createTempContextRoot(t);
  const runtime = createPersonalContextRuntime({ contextRoot });

  assert.equal(runtime.instructions, SERVER_INSTRUCTIONS);
  assert.match(runtime.instructions, /usual writing style/i);
  assert.match(runtime.instructions, /writing_style_context/i);
  assert.match(runtime.instructions, /core product positioning principles/i);
  assert.match(runtime.instructions, /product_positioning_context/i);
  assert.match(
    runtime.instructions,
    /usual outbound or prospect framing/i,
  );
  assert.match(runtime.instructions, /outbound_framing_context/i);
  assert.match(
    runtime.instructions,
    /what should i focus on this week/i,
  );
  assert.match(
    runtime.instructions,
    /current status of this project or POC and what should happen next/i,
  );
  assert.match(runtime.instructions, /continue this plan/i);
  assert.match(runtime.instructions, /pick up where we left off/i);
  assert.match(runtime.instructions, /call wake_up_context before answering/i);
  assert.match(
    runtime.instructions,
    /usual-style, product-positioning, outbound-framing, weekly-focus, project-status, next-step, or durable-continuation requests/i,
  );
  assert.match(runtime.instructions, /Use search_memory instead only/i);
  assert.match(
    runtime.instructions,
    /prefer manual_ingest so it lands in inbox\/raw-notes\.md with visible provenance first/i,
  );
  assert.match(
    runtime.instructions,
    /prefer promote_raw_note so the destination entry keeps an explicit source-note trail/i,
  );
  assert.match(
    runtime.instructions,
    /prefer mark_raw_note_status to keep inbox\/raw-notes\.md auditable without deleting the source note/i,
  );
  assert.match(
    runtime.instructions,
    /prefer link_raw_note_to_proposal so the source note records that relationship without creating a duplicate proposal entry/i,
  );
  assert.match(SEARCH_MEMORY_TOOL_DESCRIPTION, /core product-positioning/i);
  assert.match(SEARCH_MEMORY_TOOL_DESCRIPTION, /usual outbound-framing/i);
  assert.match(SEARCH_MEMORY_TOOL_DESCRIPTION, /wrapper tool or wake_up_context/i);
  assert.match(
    SEARCH_MEMORY_TOOL_DESCRIPTION,
    /project-status-or-next-step/i,
  );
  assert.match(WRITING_STYLE_CONTEXT_TOOL_DESCRIPTION, /usual writing style/i);
  assert.match(
    WRITING_STYLE_CONTEXT_TOOL_DESCRIPTION,
    /Rewrite this email to match it/i,
  );
  assert.match(
    PRODUCT_POSITIONING_CONTEXT_TOOL_DESCRIPTION,
    /core product positioning principles/i,
  );
  assert.match(
    OUTBOUND_FRAMING_CONTEXT_TOOL_DESCRIPTION,
    /usual outbound framing for prospects/i,
  );
  assert.match(
    WAKE_UP_CONTEXT_TOOL_DESCRIPTION,
    /weekly focus, current status and next step, continuing an existing plan/i,
  );
  assert.match(
    WAKE_UP_CONTEXT_TOOL_DESCRIPTION,
    /fallback when a style, product-positioning, or outbound-framing request does not fit a more specific wrapper tool/i,
  );
  assert.match(
    MANUAL_INGEST_TOOL_DESCRIPTION,
    /Capture pasted notes, transcript excerpts, or rough summaries into low-trust inbox\/raw-notes\.md with visible provenance/i,
  );
  assert.match(MANUAL_INGEST_TOOL_DESCRIPTION, /Supports dry_run preview/i);
  assert.match(
    PROMOTE_RAW_NOTE_TOOL_DESCRIPTION,
    /Promote one reviewed raw note from inbox\/raw-notes\.md into dynamic\/recent-learnings\.md or inbox\/core-update-proposals\.md with visible provenance back to the source note/i,
  );
  assert.match(
    MARK_RAW_NOTE_STATUS_TOOL_DESCRIPTION,
    /Mark one raw note in inbox\/raw-notes\.md as reviewed or promoted without deleting it/i,
  );
  assert.match(
    LINK_RAW_NOTE_TO_PROPOSAL_TOOL_DESCRIPTION,
    /Link one raw note in inbox\/raw-notes\.md to an existing entry in inbox\/core-update-proposals\.md without creating a duplicate proposal/i,
  );
});

test("extension manifest description names the public release capabilities", () => {
  const manifestPath = new URL(
    "../desktop-extension/personal-context/manifest.json",
    import.meta.url,
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  assert.match(manifest.description, /trusted Markdown personal context/i);
  assert.match(manifest.description, /read and search core, dynamic, and inbox memory/i);
  assert.match(manifest.description, /trust-aware task bundles/i);
  assert.match(manifest.description, /capture low-trust notes/i);
  assert.match(manifest.description, /promote reviewed notes/i);
  assert.match(manifest.description, /without editing core files directly/i);
});

test("manual_ingest dry run previews a low-trust raw note without mutating memory", (t) => {
  const { runtime } = createRuntimeWithFiles(t);
  const beforeRawNotes = runtime.readMemoryFile("inbox/raw-notes.md").text;
  const beforeLearnings = runtime.readMemoryFile("dynamic/recent-learnings.md").text;
  const report = runtime.manualIngest({
    source_material: `Prospects already have useful content.
But that content is not mapped to buyer objections yet.
Store this for later review.`,
    source_type: "summary",
    source_label: "April 2026 outbound debrief",
    tags: ["positioning", "objections"],
    dry_run: true,
  });
  const text = runtime.manualIngestText({
    source_material: `Prospects already have useful content.
But that content is not mapped to buyer objections yet.
Store this for later review.`,
    source_type: "summary",
    source_label: "April 2026 outbound debrief",
    tags: ["positioning", "objections"],
    dry_run: true,
  });

  assert.equal(report.mode, "dry_run");
  assert.equal(report.target_relative_path, "inbox/raw-notes.md");
  assert.equal(report.trust_level, "low");
  assert.equal(report.wrote_entry, false);
  assert.equal(report.timestamp, null);
  assert.equal(report.preview_line_count, 3);
  assert.equal(report.source_line_count, 3);
  assert.deepEqual(report.tags, [
    "positioning",
    "objections",
    "manual-ingest",
    "summary",
  ]);
  assert.match(report.entry_preview, /### PENDING_TIMESTAMP - Prospects already have useful content\./);
  assert.match(report.entry_preview, /- Summary: Manual ingest from user-provided summary: April 2026 outbound debrief\./);
  assert.match(report.entry_preview, /- Ingestion target: inbox\/raw-notes\.md/);
  assert.match(report.entry_preview, /- Source label: April 2026 outbound debrief/);
  assert.match(report.entry_preview, /- Source excerpt 2: But that content is not mapped to buyer objections yet\./);
  assert.match(report.entry_preview, /- Source: manual_ingest\/summary/);
  assert.match(text, /^# Manual Ingest/m);
  assert.match(text, /- Mode: dry_run/);
  assert.match(text, /Dry run only\. No files were changed\./);
  assert.match(text, /## Entry Preview/);
  assert.equal(runtime.readMemoryFile("inbox/raw-notes.md").text, beforeRawNotes);
  assert.equal(runtime.readMemoryFile("dynamic/recent-learnings.md").text, beforeLearnings);
});

test("manual_ingest appends a visible-provenance entry only to inbox/raw-notes.md", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "core/identity.md": buildMarkdown("Identity", [
      {
        heading: "Role",
        lines: ["- Keep this core file unchanged during manual ingest tests."],
      },
    ]),
  });
  const beforeCore = runtime.readMemoryFile("core/identity.md").text;
  const beforeDynamic = runtime.readMemoryFile("dynamic/recent-learnings.md").text;
  const report = runtime.manualIngest({
    title: "Reusable learning from prospect summary",
    source_material: `Prospect already has useful product content.
The real gap is objection mapping, not content generation.
Could matter for future product positioning.`,
    source_type: "transcript_excerpt",
    source_label: "Prospect call excerpt",
    tags: ["positioning"],
  });
  const rawNotes = runtime.readMemoryFile("inbox/raw-notes.md").text;
  const text = runtime.manualIngestText({
    title: "Explicit preview title",
    source_material: "Single-line note for preview.",
    source_type: "note",
    source_label: "Quick capture",
    dry_run: true,
  });

  assert.equal(report.mode, "write");
  assert.equal(report.wrote_entry, true);
  assert.match(report.timestamp ?? "", /^\d{4}-\d{2}-\d{2}T/);
  assert.match(
    rawNotes,
    /### .* - Reusable learning from prospect summary\n- Summary: Manual ingest from user-provided transcript excerpt: Prospect call excerpt\.\n- Ingestion target: inbox\/raw-notes\.md\n- Trust: low\n- Promotion policy: review manually before moving anything into dynamic or core memory\.\n- Source type: transcript excerpt\n- Captured source lines: 3 of 3\n- Source label: Prospect call excerpt\n- Source excerpt 1: Prospect already has useful product content\.\n- Source excerpt 2: The real gap is objection mapping, not content generation\.\n- Source excerpt 3: Could matter for future product positioning\.\n- Source: manual_ingest\/transcript_excerpt\n- Tags: positioning, manual-ingest, transcript_excerpt/,
  );
  assert.equal(runtime.readMemoryFile("core/identity.md").text, beforeCore);
  assert.equal(runtime.readMemoryFile("dynamic/recent-learnings.md").text, beforeDynamic);
  assert.match(text, /- Writes to core or dynamic: no/);
  assert.match(text, /- Target: inbox\/raw-notes\.md/);
});

test("promote_raw_note dry run previews a recent learning with explicit source-note provenance", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "inbox/raw-notes.md": `# Raw Notes Inbox

## Purpose
- Temporary capture zone for rough observations, incomplete notes, and items that have not yet earned promotion into dynamic memory or core context.

## Notes
### 2026-04-20T10:00:00.000Z - Objection mapping is the real gap
- Summary: Manual ingest from user-provided transcript excerpt: Prospect call excerpt.
- Ingestion target: inbox/raw-notes.md
- Trust: low
- Promotion policy: review manually before moving anything into dynamic or core memory.
- Source type: transcript excerpt
- Captured source lines: 2 of 2
- Source label: Prospect call excerpt
- Source excerpt 1: Prospect already has useful product content.
- Source excerpt 2: The real gap is objection mapping, not content generation.
- Source: manual_ingest/transcript_excerpt
- Tags: positioning, manual-ingest, transcript_excerpt
`,
  });
  const beforeRawNotes = runtime.readMemoryFile("inbox/raw-notes.md").text;
  const beforeLearnings = runtime.readMemoryFile("dynamic/recent-learnings.md").text;
  const report = runtime.promoteRawNote({
    source_note_heading:
      "### 2026-04-20T10:00:00.000Z - Objection mapping is the real gap",
    destination: "recent_learning",
    promoted_summary:
      "For content-heavy prospects, the real message shift is from generic content generation to buyer-objection mapping.",
    promotion_rationale:
      "This is reusable across multiple product-positioning and outbound tasks.",
    promoted_bullets: [
      "Why it matters: it reframes the objection without pretending the prospect lacks content.",
    ],
    tags: ["positioning", "objection-handling"],
    dry_run: true,
  });
  const text = runtime.promoteRawNoteText({
    source_note_heading:
      "### 2026-04-20T10:00:00.000Z - Objection mapping is the real gap",
    destination: "recent_learning",
    promoted_summary:
      "For content-heavy prospects, the real message shift is from generic content generation to buyer-objection mapping.",
    promotion_rationale:
      "This is reusable across multiple product-positioning and outbound tasks.",
    promoted_bullets: [
      "Why it matters: it reframes the objection without pretending the prospect lacks content.",
    ],
    tags: ["positioning", "objection-handling"],
    dry_run: true,
  });

  assert.equal(report.mode, "dry_run");
  assert.equal(report.destination, "recent_learning");
  assert.equal(report.target_relative_path, "dynamic/recent-learnings.md");
  assert.equal(report.source_relative_path, "inbox/raw-notes.md");
  assert.equal(report.source_note_remains_in_inbox, true);
  assert.equal(report.wrote_entry, false);
  assert.equal(report.timestamp, null);
  assert.deepEqual(report.tags, [
    "positioning",
    "objection-handling",
    "manual-promotion",
    "recent-learning",
  ]);
  assert.match(
    report.entry_preview,
    /### PENDING_TIMESTAMP - Objection mapping is the real gap/,
  );
  assert.match(
    report.entry_preview,
    /- Promotion rationale: This is reusable across multiple product-positioning and outbound tasks\./,
  );
  assert.match(
    report.entry_preview,
    /- Source note: inbox\/raw-notes\.md :: 2026-04-20T10:00:00\.000Z - Objection mapping is the real gap/,
  );
  assert.match(
    report.entry_preview,
    /- Source note summary: Manual ingest from user-provided transcript excerpt: Prospect call excerpt\./,
  );
  assert.match(report.entry_preview, /- Source: promote_raw_note\/recent_learning/);
  assert.match(text, /^# Promote Raw Note/m);
  assert.match(text, /- Destination: dynamic\/recent-learnings\.md/);
  assert.match(text, /Dry run only\. No files were changed\./);
  assert.equal(runtime.readMemoryFile("inbox/raw-notes.md").text, beforeRawNotes);
  assert.equal(runtime.readMemoryFile("dynamic/recent-learnings.md").text, beforeLearnings);
});

test("promote_raw_note writes a core update proposal and keeps the source note untouched", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "core/product-and-positioning.md": buildMarkdown("Product And Positioning", [
      {
        heading: "Core Narrative",
        lines: ["- Keep this core file unchanged during raw-note promotion tests."],
      },
    ]),
    "inbox/raw-notes.md": `# Raw Notes Inbox

## Purpose
- Temporary capture zone for rough observations, incomplete notes, and items that have not yet earned promotion into dynamic memory or core context.

## Notes
### 2026-04-20T10:00:00.000Z - Objection mapping is the real gap
- Summary: Manual ingest from user-provided transcript excerpt: Prospect call excerpt.
- Ingestion target: inbox/raw-notes.md
- Trust: low
- Promotion policy: review manually before moving anything into dynamic or core memory.
- Source type: transcript excerpt
- Captured source lines: 2 of 2
- Source label: Prospect call excerpt
- Source excerpt 1: Prospect already has useful product content.
- Source excerpt 2: The real gap is objection mapping, not content generation.
- Source: manual_ingest/transcript_excerpt
- Tags: positioning, manual-ingest, transcript_excerpt
`,
  });
  const beforeRawNotes = runtime.readMemoryFile("inbox/raw-notes.md").text;
  const beforeCore = runtime.readMemoryFile("core/product-and-positioning.md").text;
  const report = runtime.promoteRawNote({
    source_note_heading:
      "### 2026-04-20T10:00:00.000Z - Objection mapping is the real gap",
    destination: "core_update_proposal",
    target_file: "product-and-positioning",
    rationale:
      "The core positioning file should reflect objection mapping as the real gap instead of generic AI content generation.",
    proposed_changes:
      "Add a line that the product is not selling generic content generation; it maps content to buyer objections.",
    tags: ["positioning"],
  });
  const coreUpdateProposals = runtime.readMemoryFile(
    "inbox/core-update-proposals.md",
  ).text;

  assert.equal(report.mode, "write");
  assert.equal(report.destination, "core_update_proposal");
  assert.equal(report.target_relative_path, "inbox/core-update-proposals.md");
  assert.equal(report.wrote_entry, true);
  assert.equal(report.source_note_remains_in_inbox, true);
  assert.match(report.timestamp ?? "", /^\d{4}-\d{2}-\d{2}T/);
  assert.match(
    coreUpdateProposals,
    /### .* - product-and-positioning\n- Summary: The core positioning file should reflect objection mapping as the real gap instead of generic AI content generation\.\n- Proposed changes:\n- Add a line that the product is not selling generic content generation; it maps content to buyer objections\.\n- Source note: inbox\/raw-notes\.md :: 2026-04-20T10:00:00\.000Z - Objection mapping is the real gap\n- Source note remains in inbox\/raw-notes\.md for auditability\.\n- Source note summary: Manual ingest from user-provided transcript excerpt: Prospect call excerpt\.\n- Source note origin: manual_ingest\/transcript_excerpt\n- Source note tags: positioning, manual-ingest, transcript_excerpt\n- Source: promote_raw_note\/core_update_proposal\n- Tags: positioning, manual-promotion, core-update-proposal, product-and-positioning/,
  );
  assert.equal(runtime.readMemoryFile("inbox/raw-notes.md").text, beforeRawNotes);
  assert.equal(runtime.readMemoryFile("core/product-and-positioning.md").text, beforeCore);
});

test("mark_raw_note_status dry run previews a reviewed raw note without mutating memory", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "inbox/raw-notes.md": `# Raw Notes Inbox

## Purpose
- Temporary capture zone for rough observations, incomplete notes, and items that have not yet earned promotion into dynamic memory or core context.

## Notes
### 2026-04-20T10:00:00.000Z - Objection mapping is the real gap
- Summary: Manual ingest from user-provided transcript excerpt: Prospect call excerpt.
- Source: manual_ingest/transcript_excerpt
- Tags: positioning, manual-ingest, transcript_excerpt
`,
  });
  const beforeRawNotes = runtime.readMemoryFile("inbox/raw-notes.md").text;
  const report = runtime.markRawNoteStatus({
    source_note_heading:
      "### 2026-04-20T10:00:00.000Z - Objection mapping is the real gap",
    status: "reviewed",
    review_note: "Reviewed and left in inbox for now.",
    dry_run: true,
  });
  const text = runtime.markRawNoteStatusText({
    source_note_heading:
      "### 2026-04-20T10:00:00.000Z - Objection mapping is the real gap",
    status: "reviewed",
    review_note: "Reviewed and left in inbox for now.",
    dry_run: true,
  });

  assert.equal(report.mode, "dry_run");
  assert.equal(report.status, "reviewed");
  assert.equal(report.wrote_entry, false);
  assert.match(report.updated_entry_preview, /- Status: reviewed/);
  assert.match(report.updated_entry_preview, /- Review note: Reviewed and left in inbox for now\./);
  assert.match(text, /^# Mark Raw Note Status/m);
  assert.match(text, /Dry run only\. No files were changed\./);
  assert.equal(runtime.readMemoryFile("inbox/raw-notes.md").text, beforeRawNotes);
});

test("mark_raw_note_status writes promoted status metadata in place and replaces older status lines", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "dynamic/recent-learnings.md": buildMarkdown("Recent Learnings", [
      {
        heading: "Learnings",
        lines: ["- Keep this file unchanged during raw-note status tests."],
      },
    ]),
    "inbox/raw-notes.md": `# Raw Notes Inbox

## Purpose
- Temporary capture zone for rough observations, incomplete notes, and items that have not yet earned promotion into dynamic memory or core context.

## Notes
### 2026-04-20T10:00:00.000Z - Objection mapping is the real gap
- Summary: Manual ingest from user-provided transcript excerpt: Prospect call excerpt.
- Status: needs review
- Review note: Earlier placeholder note.
- Source: manual_ingest/transcript_excerpt
- Tags: positioning, manual-ingest, transcript_excerpt
`,
  });
  const beforeLearnings = runtime.readMemoryFile("dynamic/recent-learnings.md").text;

  const report = runtime.markRawNoteStatus({
    source_note_heading:
      "### 2026-04-20T10:00:00.000Z - Objection mapping is the real gap",
    status: "promoted",
    promotion_target_relative_path: "dynamic/recent-learnings.md",
    promotion_target_heading:
      "### 2026-04-20T12:00:00.000Z - Objection mapping is the real gap",
    review_note: "Promoted into reusable working memory after review.",
  });
  const rawNotes = runtime.readMemoryFile("inbox/raw-notes.md").text;

  assert.equal(report.mode, "write");
  assert.equal(report.status, "promoted");
  assert.equal(report.wrote_entry, true);
  assert.equal(
    report.promotion_target_heading,
    "2026-04-20T12:00:00.000Z - Objection mapping is the real gap",
  );
  assert.match(
    rawNotes,
    /### 2026-04-20T10:00:00\.000Z - Objection mapping is the real gap\n- Summary: Manual ingest from user-provided transcript excerpt: Prospect call excerpt\.\n- Status: promoted to dynamic\/recent-learnings\.md\n- Promotion target: dynamic\/recent-learnings\.md :: 2026-04-20T12:00:00\.000Z - Objection mapping is the real gap\n- Review note: Promoted into reusable working memory after review\.\n- Source: manual_ingest\/transcript_excerpt\n- Tags: positioning, manual-ingest, transcript_excerpt/,
  );
  assert.doesNotMatch(rawNotes, /- Status: needs review/);
  assert.doesNotMatch(rawNotes, /Earlier placeholder note/);
  assert.equal(runtime.readMemoryFile("dynamic/recent-learnings.md").text, beforeLearnings);
});

test("link_raw_note_to_proposal dry run previews a reviewed raw note linked to an existing proposal without mutating memory", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "inbox/raw-notes.md": `# Raw Notes Inbox

## Purpose
- Temporary capture zone for rough observations, incomplete notes, and items that have not yet earned promotion into dynamic memory or core context.

## Notes
### 2026-04-20T10:00:00.000Z - Packaging correction needs incorporation
- Summary: User correction about the product's two-track positioning and pilot nuance.
- Source: manual_ingest/summary
- Tags: positioning, correction, packaging
`,
    "inbox/core-update-proposals.md": `# Core Update Proposals

## Purpose
- Capture suggested changes to protected core files without editing them directly.

## Proposed Updates
### 2026-04-21T09:00:00.000Z - product-and-positioning
- Summary: Merge the packaging correction into the active product-and-positioning proposal.
- Proposed changes:
- Add the two-track positioning nuance and clarify that the pilot offer is selective rather than default.
- Source: promote_raw_note/core_update_proposal
- Tags: manual-promotion, core-update-proposal, product-and-positioning
`,
  });
  const beforeRawNotes = runtime.readMemoryFile("inbox/raw-notes.md").text;
  const beforeProposals = runtime.readMemoryFile("inbox/core-update-proposals.md").text;
  const report = runtime.linkRawNoteToProposal({
    source_note_heading:
      "### 2026-04-20T10:00:00.000Z - Packaging correction needs incorporation",
    proposal_heading:
      "### 2026-04-21T09:00:00.000Z - product-and-positioning",
    review_note:
      "Supports the existing product-and-positioning proposal instead of needing a separate proposal entry.",
    dry_run: true,
  });
  const text = runtime.linkRawNoteToProposalText({
    source_note_heading:
      "### 2026-04-20T10:00:00.000Z - Packaging correction needs incorporation",
    proposal_heading:
      "### 2026-04-21T09:00:00.000Z - product-and-positioning",
    review_note:
      "Supports the existing product-and-positioning proposal instead of needing a separate proposal entry.",
    dry_run: true,
  });

  assert.equal(report.mode, "dry_run");
  assert.equal(report.wrote_entry, false);
  assert.equal(report.proposal_reference, "2026-04-21T09:00:00.000Z - product-and-positioning");
  assert.match(report.updated_entry_preview, /- Status: reviewed/);
  assert.match(
    report.updated_entry_preview,
    /- Supports proposal: inbox\/core-update-proposals\.md :: 2026-04-21T09:00:00\.000Z - product-and-positioning/,
  );
  assert.match(text, /^# Link Raw Note To Proposal/m);
  assert.match(text, /Dry run only\. No files were changed\./);
  assert.equal(runtime.readMemoryFile("inbox/raw-notes.md").text, beforeRawNotes);
  assert.equal(
    runtime.readMemoryFile("inbox/core-update-proposals.md").text,
    beforeProposals,
  );
});

test("link_raw_note_to_proposal writes proposal-support metadata in place and leaves the proposal entry unchanged", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "inbox/raw-notes.md": `# Raw Notes Inbox

## Purpose
- Temporary capture zone for rough observations, incomplete notes, and items that have not yet earned promotion into dynamic memory or core context.

## Notes
### 2026-04-20T10:00:00.000Z - Packaging correction needs incorporation
- Summary: User correction about the product's two-track positioning and pilot nuance.
- Status: needs review
- Review note: Placeholder from earlier triage.
- Source: manual_ingest/summary
- Tags: positioning, correction, packaging
`,
    "inbox/core-update-proposals.md": `# Core Update Proposals

## Purpose
- Capture suggested changes to protected core files without editing them directly.

## Proposed Updates
### 2026-04-21T09:00:00.000Z - product-and-positioning
- Summary: Merge the packaging correction into the active product-and-positioning proposal.
- Proposed changes:
- Add the two-track positioning nuance and clarify that the pilot offer is selective rather than default.
- Source: promote_raw_note/core_update_proposal
- Tags: manual-promotion, core-update-proposal, product-and-positioning
`,
  });
  const beforeProposals = runtime.readMemoryFile("inbox/core-update-proposals.md").text;

  const report = runtime.linkRawNoteToProposal({
    source_note_heading:
      "### 2026-04-20T10:00:00.000Z - Packaging correction needs incorporation",
    proposal_heading:
      "### 2026-04-21T09:00:00.000Z - product-and-positioning",
    review_note:
      "Feeds the active product-and-positioning proposal; no duplicate proposal entry needed.",
  });
  const rawNotes = runtime.readMemoryFile("inbox/raw-notes.md").text;

  assert.equal(report.mode, "write");
  assert.equal(report.wrote_entry, true);
  assert.equal(
    report.proposal_reference,
    "2026-04-21T09:00:00.000Z - product-and-positioning",
  );
  assert.match(
    rawNotes,
    /### 2026-04-20T10:00:00\.000Z - Packaging correction needs incorporation\n- Summary: User correction about the product's two-track positioning and pilot nuance\.\n- Status: reviewed\n- Supports proposal: inbox\/core-update-proposals\.md :: 2026-04-21T09:00:00\.000Z - product-and-positioning\n- Review note: Feeds the active product-and-positioning proposal; no duplicate proposal entry needed\.\n- Source: manual_ingest\/summary\n- Tags: positioning, correction, packaging/,
  );
  assert.doesNotMatch(rawNotes, /- Status: needs review/);
  assert.doesNotMatch(rawNotes, /Placeholder from earlier triage/);
  assert.equal(
    runtime.readMemoryFile("inbox/core-update-proposals.md").text,
    beforeProposals,
  );
});

test("wrapper context tools delegate to wake-up selection with the expected durable anchors", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "core/communication-style.md": buildMarkdown("Communication Style", [
      {
        heading: "Voice",
        lines: [
          "- Usual writing style and voice should stay calm, direct, and commercially literate.",
        ],
      },
    ]),
    "core/product-and-positioning.md": buildMarkdown("Product And Positioning", [
      {
        heading: "Core Narrative",
        lines: [
          "- Core product positioning principles should focus on conversion, answer gaps, and user friction.",
        ],
      },
    ]),
    "core/outbound-playbook.md": buildMarkdown("Outbound Playbook", [
      {
        heading: "Sales Framing Principles",
        lines: [
          "- Usual outbound framing for prospects should follow one clean thread from signal to friction to pilot.",
        ],
      },
    ]),
  });

  const writingStyleReport = runtime.writingStyleContext({});
  const productPositioningReport = runtime.productPositioningContext({});
  const outboundFramingReport = runtime.outboundFramingContext({});

  assert.equal(writingStyleReport.task, "usual writing style and voice");
  assert.equal(
    writingStyleReport.items[0]?.relative_path,
    "core/communication-style.md",
  );
  assert.equal(
    productPositioningReport.task,
    "core product positioning principles",
  );
  assert.equal(
    productPositioningReport.items[0]?.relative_path,
    "core/product-and-positioning.md",
  );
  assert.equal(
    outboundFramingReport.task,
    "usual outbound framing for prospects",
  );
  assert.equal(
    outboundFramingReport.items[0]?.relative_path,
    "core/outbound-playbook.md",
  );
});

test("writing_style_context text surfaces anchor-file read-first excerpts without another file read", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "core/communication-style.md": buildMarkdown("Communication Style", [
      {
        heading: "Voice",
        lines: [
          "- Write like a sharp enterprise outbound rep, not a marketing team.",
          "- Use natural language and short sentences.",
        ],
      },
      {
        heading: "Length And Format",
        lines: [
          "- Emails should usually be 120 to 180 words.",
          "- Make them skimmable.",
        ],
      },
      {
        heading: "Words And Phrases To Avoid",
        lines: ["- unlock", "- leverage"],
      },
    ]),
  });

  const text = runtime.writingStyleContextText({});

  assert.match(text, /^# Writing Style Context/m);
  assert.match(text, /## Answer Handoff/);
  assert.match(text, /- Durable anchor: core\/communication-style\.md/);
  assert.match(text, /- Start with core\/communication-style\.md\./);
  assert.match(
    text,
    /- Voice: Write like a sharp enterprise outbound rep, not a marketing team\.; Use natural language and short sentences\./,
  );
  assert.match(text, /## Diagnostic Bundle/);
  assert.doesNotMatch(text, /## Ranked Context/);
  assert.match(text, /## Read First/);
  assert.match(text, /- File: core\/communication-style\.md/);
  assert.match(
    text,
    /Communication Style \/ Voice: Write like a sharp enterprise outbound rep, not a marketing team\.; Use natural language and short sentences\./,
  );
  assert.match(
    text,
    /Communication Style \/ Length And Format: Emails should usually be 120 to 180 words\.; Make them skimmable\./,
  );
});

test("writing_style_context keeps the user's task but biases retrieval toward communication-style for rewrite prompts", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "core/communication-style.md": buildMarkdown("Communication Style", [
      {
        heading: "Voice",
        lines: [
          "- Write like a sharp enterprise outbound rep, not a marketing team.",
        ],
      },
      {
        heading: "Length And Format",
        lines: ["- Emails should usually be 120 to 180 words."],
      },
    ]),
    "core/outbound-playbook.md": buildMarkdown("Outbound Playbook", [
      {
        heading: "Specific Prospect Email Doctrine",
        lines: [
          "- The subject line should show that we know the prospect specifically.",
          "- Anticipate the hidden objection inside the email so the prospect does not need to reply with it.",
        ],
      },
    ]),
  });

  const report = runtime.writingStyleContext({
    task: "rewrite outbound email to match the user's usual writing style",
  });
  const text = runtime.writingStyleContextText({
    task: "rewrite outbound email to match the user's usual writing style",
  });

  assert.equal(
    report.task,
    "rewrite outbound email to match the user's usual writing style",
  );
  assert.equal(
    report.items[0]?.relative_path,
    "core/communication-style.md",
  );
  assert.match(
    report.search_query,
    /usual writing style and voice rewrite outbound email to match the user's usual writing style/i,
  );
  assert.match(text, /- Task: rewrite outbound email to match the user's usual writing style/);
  assert.match(text, /- Durable anchor: core\/communication-style\.md/);
});

test("product_positioning_context text summarizes heading-only anchor sections through descendant previews", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "core/product-and-positioning.md": `# Product And Positioning

## Core Narrative
- The product helps teams reduce workflow friction and improve decision quality.

## Product Positioning Principles
### 1) Diagnose workflow friction
- Identify where users hesitate, repeat work, or lose context.

### 2) Shape the right intervention
- Create concise guidance designed to answer one recurring concern at a time.

### 3) Deploy in workflow and iterate
- Place the guidance directly where the work happens.
`,
  });

  const text = runtime.productPositioningContextText({});

  assert.match(text, /^# Product Positioning Context/m);
  assert.match(text, /## Answer Handoff/);
  assert.match(text, /## Read First/);
  assert.match(
    text,
    /- Product Positioning Principles: 1\) Diagnose workflow friction: Identify where users hesitate, repeat work, or lose context\.; 2\) Shape the right intervention: Create concise guidance designed to answer one recurring concern at a time\./,
  );
  assert.match(
    text,
    /Product And Positioning \/ Product Positioning Principles: 1\) Diagnose workflow friction: Identify where users hesitate, repeat work, or lose context\.; 2\) Shape the right intervention: Create concise guidance designed to answer one recurring concern at a time\./,
  );
});

test("outbound_framing_context text leads with an answer-ready handoff before diagnostics", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "core/outbound-playbook.md": buildMarkdown("Outbound Playbook", [
      {
        heading: "Sales Framing Principles",
        lines: [
          "- Follow one clean thread from signal to friction to pilot.",
          "- Solve the risk that matters.",
        ],
      },
      {
        heading: "Pilot Framing",
        lines: [
          "- Make the pilot feel contained rather than transformational.",
        ],
      },
    ]),
  });

  const text = runtime.outboundFramingContextText({});

  assert.match(text, /^# Outbound Framing Context/m);
  assert.match(text, /## Answer Handoff/);
  assert.match(text, /- Durable anchor: core\/outbound-playbook\.md/);
  assert.match(
    text,
    /- Pilot Framing: Make the pilot feel contained rather than transformational\./,
  );
  assert.match(
    text,
    /- Sales Framing Principles: Follow one clean thread from signal to friction to pilot\.; Solve the risk that matters\./,
  );
  assert.match(text, /## Diagnostic Bundle/);
});

test("wake_up_context text omits read-first when no items were selected", (t) => {
  const { runtime } = createRuntimeWithFiles(t);

  const text = runtime.wakeUpContextText({ task: "no-match-signal" });

  assert.doesNotMatch(text, /## Read First/);
});

test("normalizeReadMemoryFileArgs accepts the path alias and preserves canonical relative_path", () => {
  assert.equal(
    normalizeReadMemoryFileArgs({ path: "dynamic/current-priorities.md" }),
    "dynamic/current-priorities.md",
  );
  assert.equal(
    normalizeReadMemoryFileArgs({
      relative_path: "core/communication-style.md",
      path: "core/communication-style.md",
    }),
    "core/communication-style.md",
  );
});

test("normalizeReadMemoryFileArgs rejects missing and conflicting path inputs", () => {
  assert.throws(
    () => normalizeReadMemoryFileArgs({}),
    /requires relative_path \(or tolerated alias path\)/i,
  );
  assert.throws(
    () =>
      normalizeReadMemoryFileArgs({
        relative_path: "core/communication-style.md",
        path: "dynamic/current-priorities.md",
      }),
    /conflicting relative_path and path values/i,
  );
});

test("status reflects actual dynamic headings for replaceable sections", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "dynamic/active-campaigns.md": buildMarkdown("Active Campaigns", [
      { heading: "Purpose", lines: ["- Track live motions already in flight."] },
      { heading: "Live Motions", lines: ["- One active motion is running."] },
      { heading: "Suggested Entry Format", lines: ["- Campaign name:"] },
    ]),
  });

  const report = runtime.getStatusReport();
  const activeCampaigns = report.replaceableSections.find(
    (item) => item.relativePath === "dynamic/active-campaigns.md",
  );
  const activeCampaignsSurface = report.writableSurfaces.find(
    (item) => item.relativePath === "dynamic/active-campaigns.md",
  );

  assert.deepEqual(activeCampaigns?.sections, [
    "## Live Motions",
    "## Suggested Entry Format",
  ]);
  assert.equal(activeCampaignsSurface?.appendTargetSection, "## Live Motions");
  assert.equal(activeCampaignsSurface?.appendTargetPresent, true);
  assert.equal(activeCampaignsSurface?.appendTargetResolution, "alias");
  assert.equal(
    activeCampaignsSurface?.canonicalAppendTargetSection,
    "## Campaigns",
  );
  assert.equal(
    runtime.replaceDynamicSection({
      file: "active-campaigns",
      section_heading: "## Live Motions",
      content: "- Updated active motion.",
    }),
    "Replaced ## Live Motions in dynamic/active-campaigns.md.",
  );
  assert.match(
    runtime.readMemoryFile("dynamic/active-campaigns.md").text,
    /## Live Motions\n- Updated active motion\./,
  );
});

test("status surfaces scaffold-only, sparse, and missing append-target writable states", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "dynamic/current-priorities.md": buildMarkdown("Current Priorities", [
      { heading: "Purpose", lines: ["- Track live priorities."] },
      {
        heading: "Active Priorities",
        lines: ["- Only one active priority"],
      },
      { heading: "Notes", lines: ["- Keep this concise."] },
    ]),
    "dynamic/active-campaigns.md": buildMarkdown("Active Campaigns", [
      { heading: "Purpose", lines: ["- Track live motions already in flight."] },
      {
        heading: "Live Motions",
        lines: [
          "- One active motion is running.",
          "- Another motion is active too.",
        ],
      },
      { heading: "Suggested Entry Format", lines: ["- Campaign name:"] },
    ]),
    "dynamic/message-tests.md": buildMarkdown("Message Tests", [
      { heading: "Purpose", lines: ["- Track what was tried and what happened."] },
      { heading: "Experiments", lines: ["- Rename drift without an approved alias."] },
      { heading: "Suggested Entry Format", lines: ["- Test:"] },
    ]),
    "inbox/raw-notes.md": `# Raw Notes Inbox

## Purpose
- Temporary capture zone for rough observations.

## Notes
### 2026-04-12T00:00:00.000Z - First note
- Summary: Keep this note.

### 2026-04-12T00:05:00.000Z - Second note
- Summary: Keep this note too.
`,
  });

  const report = runtime.getStatusReport();
  const text = runtime.getStatusText();
  const currentPrioritiesSurface = report.writableSurfaces.find(
    (item) => item.relativePath === "dynamic/current-priorities.md",
  );
  const activeCampaignsSurface = report.writableSurfaces.find(
    (item) => item.relativePath === "dynamic/active-campaigns.md",
  );
  const messageTestsSurface = report.writableSurfaces.find(
    (item) => item.relativePath === "dynamic/message-tests.md",
  );
  const rawNotesSurface = report.writableSurfaces.find(
    (item) => item.relativePath === "inbox/raw-notes.md",
  );

  assert.deepEqual(report.memoryHealth.byState, {
    active: 2,
    sparse: 1,
    scaffold_only: 3,
    append_target_missing: 1,
  });
  assert.deepEqual(report.memoryHealth.sparseFiles, [
    "dynamic/current-priorities.md",
  ]);
  assert.deepEqual(report.memoryHealth.appendTargetMissingFiles, [
    "dynamic/message-tests.md",
  ]);

  assert.equal(currentPrioritiesSurface?.healthState, "sparse");
  assert.equal(currentPrioritiesSurface?.trackedItemCount, 1);

  assert.equal(activeCampaignsSurface?.healthState, "active");
  assert.equal(activeCampaignsSurface?.appendTargetSection, "## Live Motions");
  assert.equal(activeCampaignsSurface?.appendTargetPresent, true);
  assert.equal(activeCampaignsSurface?.appendTargetResolution, "alias");
  assert.equal(activeCampaignsSurface?.trackedItemCount, 2);
  assert.deepEqual(activeCampaignsSurface?.replaceableSections, [
    "## Live Motions",
    "## Suggested Entry Format",
  ]);

  assert.equal(messageTestsSurface?.healthState, "append_target_missing");
  assert.equal(messageTestsSurface?.appendTargetSection, "## Tests");
  assert.equal(messageTestsSurface?.appendTargetPresent, false);
  assert.equal(messageTestsSurface?.appendTargetResolution, "missing");
  assert.equal(messageTestsSurface?.trackedItemCount, null);

  assert.equal(rawNotesSurface?.healthState, "active");
  assert.equal(rawNotesSurface?.trackedItemCount, 2);
  assert.deepEqual(rawNotesSurface?.allowedOperations, ["append_entry"]);

  assert.match(text, /Write-boundary issues: 1/);
  assert.match(
    text,
    /Append-target-missing file paths: dynamic\/message-tests\.md/,
  );
  assert.match(
    text,
    /dynamic\/active-campaigns\.md[\s\S]*Append target section: ## Live Motions[\s\S]*Append target resolution: alias of ## Campaigns/,
  );
  assert.match(
    text,
    /dynamic\/message-tests\.md[\s\S]*Append target section: ## Tests \(missing\)[\s\S]*Append target resolution: missing/,
  );
});

test("maintain_dynamic_item replaces one exact bullet inside a whitelisted dynamic section", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "dynamic/current-priorities.md": buildMarkdown("Current Priorities", [
      { heading: "Purpose", lines: ["- Track live priorities."] },
      {
        heading: "Active Priorities",
        lines: [
          "- Spring event prep",
          "- Tighten retrieval quality",
        ],
      },
    ]),
  });

  assert.equal(
    runtime.maintainDynamicItem({
      file: "current-priorities",
      section_heading: "## Active Priorities",
      match_text: "- Spring event prep",
      operation: "replace",
      replacement_text: "- Archive the expired event priority and focus on the next event.",
    }),
    "Replaced exact bullet in dynamic/current-priorities.md ## Active Priorities.",
  );
  assert.match(
    runtime.readMemoryFile("dynamic/current-priorities.md").text,
    /## Active Priorities\n- Archive the expired event priority and focus on the next event\.\n- Tighten retrieval quality/,
  );
});

test("maintain_dynamic_item removes one exact dated entry and preserves surrounding entries", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "dynamic/recent-learnings.md": `# Recent Learnings

## Purpose
- Capture reusable lessons.

## Learnings
### 2026-04-01T10:00:00.000Z - First lesson
- Summary: Keep the first learning.

### 2026-04-02T10:00:00.000Z - Remove me
- Summary: This learning is stale.
- Source: review

### 2026-04-03T10:00:00.000Z - Final lesson
- Summary: Keep the final learning.
`,
  });

  assert.equal(
    runtime.maintainDynamicItem({
      file: "recent-learnings",
      section_heading: "## Learnings",
      match_text: `### 2026-04-02T10:00:00.000Z - Remove me
- Summary: This learning is stale.
- Source: review`,
      operation: "remove",
    }),
    "Removed exact entry from dynamic/recent-learnings.md ## Learnings.",
  );

  const nextText = runtime.readMemoryFile("dynamic/recent-learnings.md").text;
  assert.doesNotMatch(nextText, /Remove me/);
  assert.match(nextText, /First lesson/);
  assert.match(nextText, /Final lesson/);
});

test("maintain_dynamic_item restores the section fallback when the last item is removed", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "dynamic/current-priorities.md": buildMarkdown("Current Priorities", [
      { heading: "Purpose", lines: ["- Track live priorities."] },
      {
        heading: "Active Priorities",
        lines: ["- Only priority left"],
      },
    ]),
  });

  runtime.maintainDynamicItem({
    file: "current-priorities",
    section_heading: "## Active Priorities",
    match_text: "- Only priority left",
    operation: "remove",
  });

  assert.match(
    runtime.readMemoryFile("dynamic/current-priorities.md").text,
    /## Active Priorities\n- No live priorities recorded yet\./,
  );
});

test("maintain_dynamic_item fails loudly on ambiguous exact matches", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "dynamic/current-priorities.md": buildMarkdown("Current Priorities", [
      { heading: "Purpose", lines: ["- Track live priorities."] },
      {
        heading: "Active Priorities",
        lines: [
          "- Duplicate item",
          "- Duplicate item",
        ],
      },
    ]),
  });

  assert.throws(
    () =>
      runtime.maintainDynamicItem({
        file: "current-priorities",
        section_heading: "## Active Priorities",
        match_text: "- Duplicate item",
        operation: "remove",
      }),
    /ambiguous/,
  );
});

test("maintain_dynamic_item validates replacement shape against the matched item kind", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "dynamic/current-priorities.md": buildMarkdown("Current Priorities", [
      { heading: "Purpose", lines: ["- Track live priorities."] },
      {
        heading: "Active Priorities",
        lines: ["- Bullet to replace"],
      },
    ]),
  });

  assert.throws(
    () =>
      runtime.maintainDynamicItem({
        file: "current-priorities",
        section_heading: "## Active Priorities",
        match_text: "- Bullet to replace",
        operation: "replace",
        replacement_text: `### 2026-04-12T00:00:00.000Z - Wrong shape
- Summary: This should fail.`,
      }),
    /single markdown bullet line/,
  );
});

test("append_memory_entry resolves approved alias append targets for dynamic files", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "dynamic/active-campaigns.md": buildMarkdown("Active Campaigns", [
      { heading: "Purpose", lines: ["- Track live motions already in flight."] },
      { heading: "Live Motions", lines: ["- No active campaigns recorded yet."] },
      { heading: "Suggested Entry Format", lines: ["- Campaign name:"] },
    ]),
  });

  assert.equal(
    runtime.appendMemoryEntry({
      file: "active-campaigns",
      title: "Alias target append works",
      summary: "Entries should land in Live Motions when the canonical heading drifted.",
      source: "test",
    }),
    "Appended memory entry to dynamic/active-campaigns.md.",
  );

  assert.match(
    runtime.readMemoryFile("dynamic/active-campaigns.md").text,
    /## Live Motions\n### .* - Alias target append works\n- Summary: Entries should land in Live Motions when the canonical heading drifted\.\n- Source: test/,
  );
});

test("append_memory_entry fails clearly when no valid append target can be resolved", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "dynamic/message-tests.md": buildMarkdown("Message Tests", [
      { heading: "Purpose", lines: ["- Track what was tried and what happened."] },
      { heading: "Experiments", lines: ["- This heading is not an approved append target."] },
      { heading: "Suggested Entry Format", lines: ["- Test:"] },
    ]),
  });

  assert.throws(
    () =>
      runtime.appendMemoryEntry({
        file: "message-tests",
        title: "Broken target",
        summary: "This should fail loudly.",
      }),
    /Append target section not found in dynamic\/message-tests\.md\. Checked: ## Tests/,
  );
});

test("bootstrap_dynamic_memory resolves approved alias targets for dynamic files", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "dynamic/active-campaigns.md": buildMarkdown("Active Campaigns", [
      { heading: "Purpose", lines: ["- Track live motions already in flight."] },
      { heading: "Live Motions", lines: ["- No active campaigns recorded yet."] },
      { heading: "Suggested Entry Format", lines: ["- Campaign name:"] },
    ]),
  });

  assert.equal(
    runtime.bootstrapDynamicMemory({
      active_campaigns: [
        "First bootstrapped motion",
        "Second bootstrapped motion",
      ],
    }),
    "Bootstrapped dynamic memory files with the provided installation-time context.",
  );

  assert.match(
    runtime.readMemoryFile("dynamic/active-campaigns.md").text,
    /## Live Motions\n- First bootstrapped motion\n- Second bootstrapped motion/,
  );
  assert.doesNotMatch(
    runtime.readMemoryFile("dynamic/active-campaigns.md").text,
    /## Campaigns\n- First bootstrapped motion/,
  );
});

test("search_memory finds ranked markdown matches and respects kind filters", (t) => {
  const contextRoot = createTempContextRoot(t);
  const runtime = createPersonalContextRuntime({ contextRoot });
  const identityPath = path.join(contextRoot, "core", "identity.md");

  fs.writeFileSync(
    identityPath,
    `# Identity

## Focus
- We are building a curated memory system for Toronto founders and operator workflows.
- Trust layers matter more than generic memory volume.
`,
    "utf8",
  );

  runtime.appendMemoryEntry({
    file: "recent-learnings",
    title: "Trust layers",
    summary: "Inbox-first updates reduce accidental drift in memory systems.",
    bullets: [
      "Manual promotion beats silent background writes.",
      "Operator workflows need context you can read and audit.",
    ],
    source: "session",
  });

  const report = runtime.searchMemory({
    query: "Toronto founders trust layers",
    max_results: 5,
  });

  assert.ok(report.totalMatches >= 1);
  assert.equal(report.results[0].relativePath, "core/identity.md");
  assert.equal(report.results[0].sectionPath, "Identity / Focus");
  assert.match(
    report.results[0].snippet,
    /Toronto founders|Trust layers matter more/,
  );

  const inboxOnly = runtime.searchMemory({
    query: "Toronto founders trust layers",
    kinds: ["inbox"],
    max_results: 5,
  });

  assert.equal(inboxOnly.totalMatches, 0);
  assert.equal(inboxOnly.results.length, 0);
});

test("search_memory prettifies entry headings and downranks scaffold noise", (t) => {
  const contextRoot = createTempContextRoot(t);
  const runtime = createPersonalContextRuntime({ contextRoot });

  runtime.appendMemoryEntry({
    file: "recent-learnings",
    title: "Trust layers beat hidden automation",
    summary: "Hooks should follow search and status, not come first.",
    bullets: [
      "Prefer inbox-first capture over hidden background writes.",
      "Readable memory matters more than black-box automation.",
    ],
    source: "review",
  });

  runtime.appendMemoryEntry({
    file: "current-priorities",
    title: "Ship the engine first",
    summary: "Status and search come before hooks automation.",
    bullets: ["Reduce drift before adding more power."],
    source: "roadmap",
  });

  const hiddenAutomation = runtime.searchMemory({
    query: "hidden automation",
    max_results: 5,
  });

  assert.equal(
    hiddenAutomation.results[0].sectionPath,
    "Recent Learnings / Learnings / Trust layers beat hidden automation",
  );
  assert.doesNotMatch(
    hiddenAutomation.results[0].sectionPath,
    /\d{4}-\d{2}-\d{2}T/,
  );

  const hooksReport = runtime.searchMemory({
    query: "hooks automation",
    kinds: ["dynamic"],
    max_results: 5,
  });

  assert.equal(hooksReport.results[0].relativePath, "dynamic/current-priorities.md");
  assert.match(
    hooksReport.results[0].snippet,
    /status and search come before hooks automation/i,
  );
});

test("search_memory gives heading matches a substantive section preview when body content exists", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "core/communication-style.md": buildMarkdown("Communication Style", [
      {
        heading: "Usual Outbound Writing Style",
        lines: [
          "- Sound calm, direct, and commercially literate.",
          "- Lead with a specific observed signal.",
        ],
      },
    ]),
  });

  const report = runtime.searchMemory({
    query: "usual outbound writing style",
    max_results: 5,
  });

  assert.equal(report.results[0].relativePath, "core/communication-style.md");
  assert.equal(
    report.results[0].sectionPath,
    "Communication Style / Usual Outbound Writing Style",
  );
  assert.match(
    report.results[0].snippet,
    /Section match: Communication Style \/ Usual Outbound Writing Style - Sound calm, direct, and commercially literate\./,
  );
});

test("search_memory suppresses same-file path-only fallbacks and explains ranking", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "core/dedupe-signal.md": buildMarkdown("Dedupe Signal", [
      { heading: "dedupe-signal", lines: ["- dedupe-signal appears in content too."] },
    ]),
  });

  const report = runtime.searchMemory({
    query: "dedupe-signal",
    max_results: 5,
  });
  const text = runtime.searchMemoryText({
    query: "dedupe-signal",
    max_results: 5,
  });

  assert.equal(report.totalMatches, 1);
  assert.equal(report.suppressedPathOnlyResults, 2);
  assert.equal(report.results[0].sectionPath, "Dedupe Signal / dedupe-signal");
  assert.deepEqual(report.results[0].reasonCodes, [
    "content_match",
    "heading_match",
    "path_match",
  ]);
  assert.match(
    report.results[0].reasonSummary,
    /Matched the query in content, heading, and path\./,
  );
  assert.match(text, /Suppressed low-value path-only fallbacks: 2/);
  assert.match(text, /Why it ranked: Matched the query in content, heading, and path\./);
});

test("search_memory keeps path-only results when a file has no richer section match", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "dynamic/path-only-signal.md": buildMarkdown("Unrelated", [
      { heading: "Notes", lines: ["- this file mentions nothing useful."] },
    ]),
  });

  const report = runtime.searchMemory({
    query: "path-only-signal",
    max_results: 5,
  });

  assert.equal(report.suppressedPathOnlyResults, 2);
  assert.equal(report.totalMatches, 1);
  assert.deepEqual(report.results[0].matchedIn, ["path"]);
});

test("wake_up_context rejects missing or blank task", (t) => {
  const { runtime } = createRuntimeWithFiles(t);

  for (const input of [null, {}, { task: "" }, { task: "   " }]) {
    assert.throws(() => runtime.wakeUpContext(input), /task is required/);
  }
});

test("wake_up_context normalizes null optionals and ignores unknown keys", (t) => {
  const { runtime } = createRuntimeWithFiles(t);

  const withNulls = runtime.wakeUpContext({
    task: "normalization-signal",
    project: null,
    goal: null,
    max_items: null,
    include_inbox: null,
  });
  const withDefaults = runtime.wakeUpContext({
    task: "normalization-signal",
    extra: "ignored",
    nested: { ignored: true },
  });

  assert.deepEqual(withNulls, withDefaults);
});

test("wake_up_context defaults to core and dynamic only", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "core/identity.md": buildMarkdown("Identity", [
      { heading: "Focus", lines: ["- bundle-signal durable context."] },
    ]),
    "dynamic/current-priorities.md": buildMarkdown("Current Priorities", [
      { heading: "Active Priorities", lines: ["- bundle-signal active context."] },
    ]),
    "inbox/raw-notes.md": buildMarkdown("Raw Notes Inbox", [
      { heading: "Notes", lines: ["- bundle-signal provisional note."] },
    ]),
  });

  const report = runtime.wakeUpContext({ task: "bundle-signal" });

  assert.deepEqual(report.applied_kinds, ["core", "dynamic"]);
  assert.ok(report.items.every((item) => item.kind !== "inbox"));
});

test("wake_up_context anchors on core when core is within six adjusted points", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "core/identity.md": buildMarkdown("Identity", [
      { heading: "Focus", lines: ["- anchor-window durable truth."] },
    ]),
    "dynamic/anchor-window.md": buildMarkdown("Anchor Window", [
      { heading: "Work", lines: ["- anchor-window current execution note."] },
    ]),
  });

  const report = runtime.wakeUpContext({ task: "anchor-window", max_items: 2 });

  assert.equal(report.items[0].kind, "core");
  assert.equal(report.items[0].relative_path, "core/identity.md");
  assert.equal(report.items[1].kind, "dynamic");
  assert.ok(report.items[1].search_score > report.items[0].search_score);
});

test("wake_up_context lets dynamic lead when it clearly outmatches core", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "core/identity.md": buildMarkdown("Identity", [
      { heading: "Focus", lines: ["- dynamic leads durable truth."] },
    ]),
    "dynamic/dynamic-leads.md": buildMarkdown("Dynamic Leads", [
      { heading: "Dynamic Leads", lines: ["- dynamic leads live execution detail."] },
    ]),
  });

  const report = runtime.wakeUpContext({ task: "dynamic leads", max_items: 2 });

  assert.equal(report.items[0].kind, "dynamic");
  assert.equal(report.items[0].relative_path, "dynamic/dynamic-leads.md");
  assert.ok(report.items.some((item) => item.kind === "core"));
});

test("wake_up_context prefers task-specific dynamic planning context over loose core matches", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "core/product-and-positioning.md": buildMarkdown("Product And Positioning", [
      {
        heading: "Response To Buyer Concerns",
        lines: [
          "- Acknowledge existing content, then redirect to whether current content answers the right questions at the right moment onsite.",
        ],
      },
    ]),
    "dynamic/current-priorities.md": buildMarkdown("Current Priorities", [
      {
        heading: "Purpose",
        lines: ["- This file ranks attention across live workstreams."],
      },
      {
        heading: "Active Priorities",
        lines: [
          "- Read this section as the answer to \"what should I focus on right now?\"",
          "- Weekly planning should load current priorities first.",
        ],
      },
    ]),
  });

  const report = runtime.wakeUpContext({
    task: "decide what to focus on right now across live workstreams",
    project: "weekly planning",
    goal: "load current priorities first",
    max_items: 2,
  });

  assert.equal(report.items[0].kind, "dynamic");
  assert.equal(report.items[0].relative_path, "dynamic/current-priorities.md");
  assert.equal(
    report.items[0].section_path,
    "Current Priorities / Active Priorities",
  );
  assert.ok(report.items.some((item) => item.kind === "core"));
});

test("wake_up_context adds the complementary trusted kind early", (t) => {
  const coreFirst = createRuntimeWithFiles(t, {
    "core/high-core.md": buildMarkdown("High Core", [
      { heading: "Reference", lines: ["- complement core durable source."] },
    ]),
    "core/secondary-core.md": buildMarkdown("Secondary Core", [
      { heading: "Reference", lines: ["- complement core supporting source."] },
    ]),
    "dynamic/context.md": buildMarkdown("Context", [
      { heading: "Work", lines: ["- complement core working context."] },
    ]),
  }).runtime;

  const coreFirstReport = coreFirst.wakeUpContext({
    task: "complement core",
    max_items: 3,
  });

  assert.equal(coreFirstReport.items[0].kind, "core");
  assert.equal(coreFirstReport.items[1].kind, "dynamic");

  const dynamicFirst = createRuntimeWithFiles(t, {
    "dynamic/complement-dynamic.md": buildMarkdown("Complement Dynamic", [
      {
        heading: "Complement Dynamic",
        lines: ["- complement dynamic active context."],
      },
    ]),
    "dynamic/complement-dynamic-extra.md": buildMarkdown("Complement Dynamic Extra", [
      { heading: "Work", lines: ["- complement dynamic extra active context."] },
    ]),
    "core/reference.md": buildMarkdown("Reference", [
      { heading: "Focus", lines: ["- complement dynamic durable source."] },
    ]),
  }).runtime;

  const dynamicFirstReport = dynamicFirst.wakeUpContext({
    task: "complement dynamic",
    max_items: 3,
  });

  assert.equal(dynamicFirstReport.items[0].kind, "dynamic");
  assert.equal(dynamicFirstReport.items[1].kind, "core");
});

test("wake_up_context deduplicates by file plus section", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "core/dedupe.md": buildMarkdown("Dedupe", [
      { heading: "dedupe-signal", lines: ["- dedupe-signal appears in content too."] },
    ]),
  });

  const searchReport = runtime.searchMemory({
    query: "dedupe-signal",
    max_results: 5,
  });
  const report = runtime.wakeUpContext({ task: "dedupe-signal", max_items: 2 });

  assert.equal(
    searchReport.results.filter(
      (result) =>
        result.relativePath === "core/dedupe.md" &&
        result.sectionPath === "Dedupe / dedupe-signal",
    ).length,
    1,
  );
  assert.equal(report.eligible_candidate_count, 1);
  assert.equal(report.items.length, 1);
  assert.equal(report.items[0].relative_path, "core/dedupe.md");
  assert.equal(report.items[0].section_path, "Dedupe / dedupe-signal");
});

test("wake_up_context excludes path-only candidates when content or heading matches exist", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "core/identity.md": buildMarkdown("Identity", [
      { heading: "Focus", lines: ["- path-only-signal durable match."] },
    ]),
    "dynamic/path-only-signal.md": buildMarkdown("Unrelated", [
      { heading: "Notes", lines: ["- this file mentions nothing useful."] },
    ]),
  });

  const report = runtime.wakeUpContext({ task: "path-only-signal", max_items: 2 });
  const nextRead = report.next_reads.find(
    (item) => item.relative_path === "dynamic/path-only-signal.md",
  );

  assert.ok(
    report.items.every(
      (item) => item.relative_path !== "dynamic/path-only-signal.md",
    ),
  );
  assert.equal(nextRead?.reason_not_selected, "path_only_candidate");
});

test("wake_up_context caps same-file dominance", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "core/dominant.md": buildMarkdown("Dominant", [
      { heading: "One", lines: ["- dominance-signal appears strongly here."] },
      { heading: "Two", lines: ["- dominance-signal appears strongly here too."] },
      { heading: "Three", lines: ["- dominance-signal appears strongly here again."] },
    ]),
    "core/other.md": buildMarkdown("Other", [
      { heading: "Reference", lines: ["- dominance-signal weaker supporting note."] },
    ]),
  });

  const report = runtime.wakeUpContext({ task: "dominance-signal", max_items: 4 });
  const dominantItems = report.items.filter(
    (item) => item.relative_path === "core/dominant.md",
  );
  const otherIndex = report.items.findIndex(
    (item) => item.relative_path === "core/other.md",
  );
  const secondDominantIndex = report.items.findIndex(
    (item, index) =>
      item.relative_path === "core/dominant.md" &&
      index > 0,
  );

  assert.ok(dominantItems.length <= 2);
  assert.notEqual(otherIndex, -1);
  assert.notEqual(secondDominantIndex, -1);
  assert.ok(otherIndex < secondDominantIndex);
});

test("wake_up_context includes at most one inbox item when opted in", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "core/identity.md": buildMarkdown("Identity", [
      { heading: "Focus", lines: ["- opted-inbox-signal durable anchor."] },
    ]),
    "dynamic/current-priorities.md": buildMarkdown("Current Priorities", [
      { heading: "Active Priorities", lines: ["- opted-inbox-signal active work."] },
    ]),
    "inbox/raw-notes.md": buildMarkdown("Raw Notes Inbox", [
      { heading: "Notes", lines: ["- opted-inbox-signal inbox note one."] },
    ]),
    "inbox/inbox-extra.md": buildMarkdown("Inbox Extra", [
      { heading: "Notes", lines: ["- opted-inbox-signal inbox note two."] },
    ]),
  });

  const report = runtime.wakeUpContext({
    task: "opted-inbox-signal",
    include_inbox: true,
    max_items: 4,
  });
  const inboxItems = report.items.filter((item) => item.kind === "inbox");

  assert.ok(inboxItems.length <= 1);
  assert.notEqual(report.items[0].kind, "inbox");
});

test("wake_up_context returns low-trust-only fallback when only inbox matches exist and inbox is opted in", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "inbox/raw-notes.md": buildMarkdown("Raw Notes Inbox", [
      { heading: "Notes", lines: ["- low-trust-only provisional note."] },
    ]),
  });

  const report = runtime.wakeUpContext({
    task: "low-trust-only",
    include_inbox: true,
  });

  assert.equal(report.items[0].kind, "inbox");
  assert.ok(warningCodes(report).includes("LOW_TRUST_ONLY"));
});

test("wake_up_context suppresses inbox-only results by default", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "inbox/raw-notes.md": buildMarkdown("Raw Notes Inbox", [
      { heading: "Notes", lines: ["- inbox-default provisional note."] },
    ]),
  });

  const report = runtime.wakeUpContext({ task: "inbox-default" });

  assert.equal(report.items.length, 0);
  assert.ok(warningCodes(report).includes("ONLY_INBOX_MATCHES_EXCLUDED"));
});

test("wake_up_context reports no matches when nothing relevant exists in allowed kinds", (t) => {
  const { runtime } = createRuntimeWithFiles(t);

  const report = runtime.wakeUpContext({ task: "no-match-signal" });

  assert.equal(report.eligible_candidate_count, 0);
  assert.equal(report.items.length, 0);
  assert.deepEqual(report.next_reads, []);
  assert.deepEqual(warningCodes(report), ["NO_MATCHES"]);
  assert.match(
    report.summary,
    /No wake-up bundle matches were found in core and dynamic, and inbox was not requested\./,
  );
});

test("wake_up_context reports sparse single-file bundles without filler", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "core/single.md": buildMarkdown("Single", [
      { heading: "One", lines: ["- sparse-signal durable note."] },
      { heading: "Two", lines: ["- sparse-signal second durable note."] },
    ]),
  });

  const report = runtime.wakeUpContext({ task: "sparse-signal", max_items: 6 });
  const codes = warningCodes(report);

  assert.ok(report.items.length < 6);
  assert.ok(codes.includes("SPARSE_RESULTS"));
  assert.ok(codes.includes("SINGLE_FILE_BUNDLE"));
});

test("wake_up_context reports candidate truncation", (t) => {
  const files = {};
  for (let index = 1; index <= 19; index += 1) {
    const padded = String(index).padStart(2, "0");
    files[`core/truncation-${padded}.md`] = buildMarkdown(`Truncation ${padded}`, [
      { heading: "Context", lines: ["- truncation-signal durable note."] },
    ]);
  }

  const { runtime } = createRuntimeWithFiles(t, files);
  const report = runtime.wakeUpContext({ task: "truncation-signal" });

  assert.equal(report.candidate_pool_truncated, true);
  assert.ok(warningCodes(report).includes("CANDIDATE_POOL_TRUNCATED"));
});

test("wake_up_context emits deterministic tie ordering", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "core/a-file.md": buildMarkdown("A File", [
      { heading: "Alpha", lines: ["- tie-signal durable note."] },
      { heading: "Beta", lines: ["- tie-signal durable note."] },
    ]),
    "core/b-file.md": buildMarkdown("B File", [
      { heading: "Alpha", lines: ["- tie-signal durable note."] },
      { heading: "Beta", lines: ["- tie-signal durable note."] },
    ]),
  });

  const report = runtime.wakeUpContext({ task: "tie-signal", max_items: 4 });

  assert.deepEqual(
    report.items.map((item) => `${item.relative_path}::${item.section_path}`),
    [
      "core/a-file.md::A File / Alpha",
      "core/b-file.md::B File / Alpha",
      "core/a-file.md::A File / Beta",
      "core/b-file.md::B File / Beta",
    ],
  );
});

test("wake_up_context renders deterministic markdown", (t) => {
  const { runtime } = createRuntimeWithFiles(t, {
    "core/identity.md": buildMarkdown("Identity", [
      { heading: "Focus", lines: ["- render-signal durable context."] },
    ]),
    "dynamic/render-signal.md": buildMarkdown("Unrelated", [
      { heading: "Notes", lines: ["- this file is only a path match."] },
    ]),
  });

  const text = runtime.wakeUpContextText({
    task: "render-signal",
    max_items: 6,
  });

  assert.match(text, /^# Wake Up Context/m);
  assert.match(text, /- Task: render-signal/);
  assert.match(text, /- Included kinds: core, dynamic/);
  assert.match(text, /- Bundle size: 1 of 6/);
  assert.ok(text.indexOf("## Orientation") < text.indexOf("## Ranked Context"));
  assert.ok(text.indexOf("## Ranked Context") < text.indexOf("## Next Reads"));
  assert.ok(text.indexOf("## Next Reads") < text.indexOf("## Warnings"));
  assert.match(
    text,
    /1\. core\/identity\.md\n- Section: Identity \/ Focus\n- Kind: core\n- Trust: high\n- Matched in: [^\n]+\n- Search score: \d+\n- Adjusted score: \d+\n- Why included: [^\n]+\n- Snippet: [^\n]+/,
  );
});
