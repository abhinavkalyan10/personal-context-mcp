# Starter Personal Context Portfolio

This is a blank starter portfolio for the `personal-context` Claude Desktop extension.

Copy this folder before you use it:

```bash
cp -R starter-personal-context-portfolio my-personal-context-portfolio
```

Then point the Claude Desktop extension at `my-personal-context-portfolio/`.

Your copied portfolio will contain private context once you fill it in. Keep it out of public Git history. The default `my-personal-context-portfolio/` folder name is ignored by the parent repo.

## Structure

- `core/`
  Durable truth about you and how Claude should work with you.
- `dynamic/`
  Working memory that Claude can update over time.
- `inbox/`
  Low-trust notes, partial ideas, and proposed core changes.

## Rule of Thumb

- Put stable truth in `core/`
- Put evolving but reusable context in `dynamic/`
- Put uncertain or tentative context in `inbox/`
