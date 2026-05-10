# V2 Demo Walkthrough

This walkthrough shows the intended shape of Personal Context MCP after install. It uses the blank starter portfolio model, so the examples are intentionally generic and safe. Exact ranking and snippets will change as you fill in your own files.

The important idea: Claude is not guessing from an opaque memory blob. It is waking up through a context folder you can open, inspect, edit, and move anywhere.

## 1. Start With Status

Prompt:

```text
Use the personal-context extension to run status and show me the available tools, writable surfaces, and memory health.
```

What you should see:

```text
Memory health: clean

Writable surfaces include:
- dynamic/account-patterns.md -> append, replace, maintain
- dynamic/active-campaigns.md -> append, replace, maintain
- dynamic/current-priorities.md -> append, replace, maintain
- dynamic/message-tests.md -> append, replace, maintain
- dynamic/recent-learnings.md -> append, replace, maintain
- inbox/raw-notes.md -> append only
- inbox/core-update-proposals.md -> append only

Available tools include:
status, list_memory_files, read_memory_file, search_memory, wake_up_context,
writing_style_context, product_positioning_context, outbound_framing_context,
manual_ingest, append_memory_entry, maintain_dynamic_item, promote_raw_note,
mark_raw_note_status, link_raw_note_to_proposal, propose_core_update
```

Why it matters: before Claude edits anything, you can see what it is allowed to touch.

## 2. Search Before Reading Everything

Prompt:

```text
Use the personal-context extension to search_memory for "current priorities" and show the strongest matches with ranking reasons.
```

What you should see:

```text
Top matches:
1. dynamic/current-priorities.md -> Active Priorities
   Reason: heading and path match the query.
2. core/agent-rules.md -> Memory Update Rules
   Reason: adjacent guidance about keeping priorities current.

Takeaway:
The direct answer lives in dynamic/current-priorities.md.
```

Why it matters: search results are ranked and explainable, not a silent retrieval guess.

## 3. Build a Wake-Up Bundle

Prompt:

```text
Use the personal-context extension to run wake_up_context for the task "What should I focus on this week?" and show the ranked bundle.
```

What you should see:

```text
Read first:
dynamic/current-priorities.md -> Active Priorities

Ranked context:
1. dynamic/current-priorities.md -> Active Priorities
2. core/identity.md -> How Claude Should Think About You
3. dynamic/recent-learnings.md -> Learnings
4. core/communication-style.md -> Avoid
```

Why it matters: Claude gets a small focused bundle for the task instead of flooding the chat with every file.

## 4. Capture Rough Notes Safely

Prompt:

```text
Use the personal-context extension to manual_ingest this pasted rough note as a dry run, then show the entry preview: "A customer interview repeated the same setup concern, but I have not turned it into a reusable pattern yet."
```

What you should see:

```text
Dry run complete. Nothing was written.

Would write to:
inbox/raw-notes.md

Trust: low
Promotion policy: review manually before moving anything into dynamic or core memory
Source: manual_ingest/note
```

Why it matters: new observations land as low-trust inbox material first. They do not become durable truth automatically.

## 5. Promote Only Reviewed Context

Prompt:

```text
Use the personal-context extension to promote_raw_note as a dry run from inbox/raw-notes.md into dynamic/recent-learnings.md, keeping the source-note trail visible.
```

What you should see:

```text
Dry run complete. Nothing was written.

Would promote one reviewed raw note into:
dynamic/recent-learnings.md

Source-note trail:
- Original raw note remains in inbox/raw-notes.md
- Promoted entry keeps provenance back to the source note
```

Why it matters: the system supports learning over time without erasing where a claim came from.

## The V2 Loop

```text
status -> search_memory -> wake_up_context -> manual_ingest -> review -> promote
```

That loop is the product. It keeps context useful, inspectable, and user-owned.
