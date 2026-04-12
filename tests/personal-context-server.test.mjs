import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createPersonalContextRuntime } from "../lib/personal-context-server.mjs";

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

  assert.equal(report.fileCounts.core, 0);
  assert.equal(report.fileCounts.dynamic, 5);
  assert.equal(report.fileCounts.inbox, 2);
  assert.ok(report.toolNames.includes("status"));
  assert.ok(report.toolNames.includes("search_memory"));
  assert.ok(report.toolNames.includes("wake_up_context"));
  assert.ok(report.writableFiles.includes("dynamic/current-priorities.md"));
  assert.ok(report.writableFiles.includes("inbox/raw-notes.md"));
  assert.match(text, /# Personal Context Status/);
  assert.match(text, /dynamic\/recent-learnings\.md/);
  assert.match(text, /search_memory/);
  assert.match(text, /wake_up_context/);
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

  assert.deepEqual(activeCampaigns?.sections, [
    "## Live Motions",
    "## Suggested Entry Format",
  ]);
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
