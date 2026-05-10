# Personal Context MCP

A Markdown-first MCP for Claude Desktop that makes AI memory portable, structured, and user-owned.

`personal-context-mcp` helps you stop re-explaining yourself to AI across sessions, projects, and platforms.

## In Action

![Personal Context MCP in Claude Desktop](./assets/personal-context-mcp.gif)

Instead of relying on opaque in-app memory, it stores context in files you control and exposes that context to Claude through an MCP extension.

## Who This Is For

This is most useful if you:

- use Claude heavily
- switch between multiple AI workflows
- want continuity across sessions and projects
- want portable memory instead of product-specific memory lock-in

## What Makes This Different

This project is intentionally opinionated:

- Markdown-first, so the memory layer stays portable and inspectable
- `core / dynamic / inbox`, so durable truth, working memory, and tentative notes do not get mixed together
- human-reviewable, so the important context is visible and editable in plain files
- portable as plain files, so your context is not trapped inside one AI product

## The Problem

As you use more AI tools, you end up paying the same tax over and over:

- re-explaining your role
- re-explaining your projects
- re-explaining your preferences
- re-explaining your constraints
- re-explaining how you want outputs written

That repetition wastes time, lowers quality, and creates memory lock-in inside individual products.

## The Model

This project uses a simple three-layer memory model:

- `core/`
  Durable truth. Identity, positioning, communication style, operating rules.
- `dynamic/`
  Working memory. Current priorities, active campaigns, recent learnings, message tests, account patterns.
- `inbox/`
  Low-trust notes. Rough observations, partial ideas, and proposed core updates.

This is the key design choice.

The point is not just to “store context.”  
The point is to separate stable truth from evolving memory and uncertain notes.

## Why This Is Different

Many personal context systems focus on storing user data or exposing one big context object.

This project is more opinionated:

- Markdown-first, not schema-first
- modular, not monolithic
- designed for human review
- designed for ongoing memory maintenance, not just initial setup
- explicit separation between durable context, working memory, and tentative notes

## What It Includes

- a Claude Desktop unpacked extension
- an MCP server built on the official MCP SDK
- a starter personal context portfolio
- a quickstart for installing and bootstrapping the system

## Repo Structure

```text
.
├── desktop-extension/personal-context/
├── mcp/
├── starter-personal-context-portfolio/
├── QUICKSTART.md
└── package.json
```

## How It Works

Once installed, Claude can:

- list available memory files
- read a specific file
- search across memory files with ranked snippets and transparent relevance rationale
- build a small trust-aware wake-up bundle for a task before starting work
- capture pasted notes, transcript excerpts, or rough summaries into low-trust inbox memory with visible provenance
- promote reviewed raw notes into reusable learnings or protected core-update proposals while keeping a visible source-note trail
- mark raw notes as reviewed or promoted in place so inbox capture stays auditable instead of looking perpetually unresolved
- link reviewed raw notes to an existing core-update proposal without creating a duplicate proposal entry
- append durable learnings to working memory
- replace or remove exact bullets and dated entries in dynamic memory without guessing
- replace selected sections in dynamic files
- bootstrap dynamic memory
- propose updates to protected core files without editing them directly

## Install

See [QUICKSTART.md](./QUICKSTART.md).

Clone the repo:

```bash
git clone https://github.com/abhinavkalyan10/personal-context-mcp.git
cd personal-context-mcp
```

## Best Use Cases

This is most useful if you:

- use Claude frequently
- switch between multiple AI workflows
- want continuity across sessions
- care about user-owned memory instead of product-owned memory

## What This Is Not

This is not magical autonomous memory.

It does not replace:

- judgment
- selective curation
- periodic cleanup
- manual review of durable truth

It is a structured memory layer, not a substitute for thinking.

## Suggested One-Line Description

> Personal Context MCP is a portable, Markdown-based memory system for Claude Desktop that separates durable context, working memory, and low-trust notes so AI assistants can stay useful without trapping memory inside one product.

## License

MIT
