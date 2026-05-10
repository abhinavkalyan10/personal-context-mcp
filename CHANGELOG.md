# Changelog

All notable changes to this project are documented here.

This project uses semantic versioning for public release tags.

## Unreleased

- Added a V2 demo walkthrough that shows the status, search, wake-up context, manual ingestion, and promotion loop.
- Linked the walkthrough from the README and Quickstart.

## v0.2.1 - 2026-05-09

Docs and release hardening for the V2 public surface.

- Tightened the README around the project model, V2 tool surface, requirements, and privacy boundary.
- Added a tool surface table that distinguishes read-only tools from `dynamic/` and `inbox/` write tools.
- Added `PRIVACY.md` and `SECURITY.md`.
- Added GitHub Actions CI for `npm test` and `npm pack --dry-run`.
- Improved package metadata for public discovery and runtime expectations.

No runtime behavior changed in this release.

## v0.2.0 - 2026-05-09

V2 release surface for Personal Context MCP.

- Added ranked `search_memory` with transparent ranking reasons.
- Added trust-aware `wake_up_context` bundles for task startup.
- Added durable context wrappers: `writing_style_context`, `product_positioning_context`, and `outbound_framing_context`.
- Added low-trust manual ingestion with `manual_ingest`.
- Added raw-note triage and promotion tools: `promote_raw_note`, `mark_raw_note_status`, and `link_raw_note_to_proposal`.
- Kept protected core updates flowing through proposals instead of direct `core/` edits.

Validation:

- `npm test` passed: 52/52.
- MCP stdio smoke passed across 17 tools.
- `npm pack --dry-run` produced 25 files.

## v0.1.0 - 2026-04-04

Initial public release.

- Added the Claude Desktop unpacked extension.
- Added the Markdown starter portfolio.
- Added the MCP server entrypoint and quickstart flow.
