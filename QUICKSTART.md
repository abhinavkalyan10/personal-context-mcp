# Quickstart

This is the fastest path to getting `personal-context-mcp` running in Claude Desktop.

## 1. Check requirements

You need:

- Claude Desktop with local extensions enabled
- Node.js 20 or newer
- npm

## 2. Clone the repo

```bash
git clone https://github.com/abhinavkalyan10/personal-context-mcp.git
cd personal-context-mcp
```

## 3. Install dependencies

Install the root server dependencies:

```bash
npm install
```

Install the Claude Desktop extension dependencies:

```bash
npm run install:extension
```

Prepare a self-contained unpacked extension bundle:

```bash
npm run prepare:extension
```

## 4. Create your own portfolio

Copy the starter template:

```bash
cp -R starter-personal-context-portfolio my-personal-context-portfolio
```

`my-personal-context-portfolio/` is ignored by this repo so your filled personal context does not get committed by accident. If you use a different folder name, keep it outside Git or add it to your own `.gitignore` before filling it in.

Then fill in your own core files:

- `my-personal-context-portfolio/core/identity.md`
- `my-personal-context-portfolio/core/product-and-positioning.md`
- `my-personal-context-portfolio/core/communication-style.md`
- `my-personal-context-portfolio/core/agent-rules.md`

If outbound is part of your work, also fill in:

- `my-personal-context-portfolio/core/outbound-playbook.md`

## 5. Install the Claude Desktop extension

In Claude Desktop:

1. Open `Settings -> Extensions`
2. Click `Install Unpacked Extension`
3. Select the `.build/claude-extension/personal-context` folder inside the repo you just cloned.
4. When prompted for `Personal Context Folder`, choose `my-personal-context-portfolio` inside that same repo.
5. Enable the extension
6. Start a fresh chat

## Refresh an existing unpacked install

If you already have an installed unpacked extension and want to refresh that runtime from the repo, reuse the same prepared bundle and sync it into Claude's installed extension directory:

```bash
PERSONAL_CONTEXT_EXTENSION_TARGET="/absolute/path/to/local.unpacked.your-extension" npm run sync:extension
```

You can also pass the target explicitly:

```bash
npm run sync:extension -- --target "/absolute/path/to/local.unpacked.your-extension"
```

The sync workflow keeps machine-specific paths out of the repo, reuses the shared server runtime, and leaves your chosen personal context folder untouched.

## 6. Validate

Use these prompts:

- `Use the personal-context extension to list available memory files.`
- `Use the personal-context extension to read core/identity.md and summarize who I am.`
- `Use the personal-context extension to read core/communication-style.md and explain how you should write for me.`
- `Use the personal-context extension to search_memory for "current priorities" and show the strongest matches.`
- `Use the personal-context extension to run wake_up_context for the task "What should I focus on this week?" and show the ranked bundle.`
- `Use the personal-context extension to manual_ingest this pasted rough note as a dry run, then show the entry preview: "A customer interview repeated the same setup concern, but I have not turned it into a reusable pattern yet."`
- `Use the personal-context extension to promote_raw_note as a dry run from inbox/raw-notes.md into dynamic/recent-learnings.md, keeping the source-note trail visible.`
- `Use the personal-context extension to mark_raw_note_status as a dry run for one inbox/raw-notes.md entry, marking it reviewed or promoted without deleting it.`
- `Use the personal-context extension to link_raw_note_to_proposal as a dry run so one inbox/raw-notes.md note clearly supports an existing inbox/core-update-proposals.md entry without creating a duplicate proposal.`

These prompts exercise the V2 surface: status/read tools, ranked search, wake-up context bundles, low-trust manual ingestion, and review/promotion flows.

For a guided example of what good output looks like, see [docs/v2-demo-walkthrough.md](./docs/v2-demo-walkthrough.md).

## 7. Bootstrap

Use this prompt in a fresh Claude chat:

```text
Use the personal-context extension to do a one-time bootstrap of my personal context portfolio from this conversation.

First:
1. List all available memory files.
2. Read every core file.
3. Read every dynamic and inbox file.

Then bootstrap the portfolio using only information from this conversation that is clearly reusable.

Rules:
- Be selective.
- Do not dump or summarize the whole chat.
- Do not copy long passages verbatim.
- Do not invent detail to fill space.
- If something is weak or tentative, put it in inbox/raw-notes.md.
- If something is durable and useful for future work, write it into the right dynamic file.
- Do not edit core files directly.
- If a core file should change, use propose_core_update instead.

Be conservative:
- If a file does not have enough strong evidence, leave it unchanged.
- Fewer high-quality entries are better than filling every file.
```

## 8. Enrich Over Time

The best operating model is:

- keep `core/` stable
- use `manual_ingest` for pasted notes, transcript excerpts, or rough summaries so they land in `inbox/raw-notes.md` with visible provenance first
- use `promote_raw_note` when one reviewed raw note has earned promotion into `dynamic/recent-learnings.md` or `inbox/core-update-proposals.md`
- use `mark_raw_note_status` after review or promotion so source notes remain auditable but no longer look unresolved
- use `link_raw_note_to_proposal` when a reviewed raw note supports an existing `inbox/core-update-proposals.md` entry and should point there instead of spawning a duplicate proposal
- let Claude update `dynamic/` when something durable is learned
- use `maintain_dynamic_item` when one exact bullet or dated entry in `dynamic/` should be replaced or removed without rewriting the whole section
- use `inbox/` for rough notes and uncertain ideas
- review core update proposals manually

## Troubleshooting

If the extension does not appear in Claude Desktop, rerun:

```bash
npm run prepare:extension
```

Then reinstall the unpacked extension from `.build/claude-extension/personal-context` and start a fresh Claude chat.

If a tool says it cannot find your portfolio, check that the extension setting points at the copied portfolio folder, not the starter template.

If you refresh an already installed unpacked extension, use `npm run sync:extension` with the installed extension directory as the target. The sync command updates the extension runtime but does not modify your selected personal context folder.

## Privacy Reminder

The starter portfolio is blank and safe to copy. Your filled portfolio is private data. Keep it outside public Git history.

See [PRIVACY.md](./PRIVACY.md) for the privacy model and [SECURITY.md](./SECURITY.md) for reporting security concerns.
