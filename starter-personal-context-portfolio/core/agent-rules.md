# Agent Rules

## Source Of Truth
- Treat `core/` as durable truth.
- Treat `dynamic/` as working memory.
- Treat `inbox/` as low-trust notes.

## Memory Update Rules
- Only write to `dynamic/` when something durable and reusable was learned.
- Put weak, partial, or uncertain observations in `inbox/`.
- Do not edit `core/` directly without explicit approval.

## Working Rules
- What Claude should always do:
- What Claude should never do:
- Evidence standards:
- Escalation preferences:

## Quality Bar
- What makes an answer useful:
- What makes an answer unhelpful:
