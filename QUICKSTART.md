# Quickstart

This is the fastest path to getting `personal-context-mcp` running in Claude Desktop.

## 1. Clone the repo

```bash
git clone <repo-url>
cd personal-context-mcp
```

## 2. Install dependencies

Install the root server dependencies:

```bash
npm install
```

Install the Claude Desktop extension dependencies:

```bash
npm install --prefix ./desktop-extension/personal-context
```

## 3. Create your own portfolio

Copy the starter template:

```bash
cp -R starter-personal-context-portfolio my-personal-context-portfolio
```

Then fill in your own core files:

- `my-personal-context-portfolio/core/identity.md`
- `my-personal-context-portfolio/core/product-and-positioning.md`
- `my-personal-context-portfolio/core/communication-style.md`
- `my-personal-context-portfolio/core/agent-rules.md`

If outbound is part of your work, also fill in:

- `my-personal-context-portfolio/core/outbound-playbook.md`

## 4. Install the Claude Desktop extension

In Claude Desktop:

1. Open `Settings -> Extensions`
2. Click `Install Unpacked Extension`
3. Select:

```text
<repo-folder>/desktop-extension/personal-context
```

4. When prompted for `Personal Context Folder`, choose:

```text
<repo-folder>/my-personal-context-portfolio
```

5. Enable the extension
6. Start a fresh chat

## 5. Validate

Use these prompts:

- `Use the personal-context extension to list available memory files.`
- `Use the personal-context extension to read core/identity.md and summarize who I am.`
- `Use the personal-context extension to read core/communication-style.md and explain how you should write for me.`

## 6. Bootstrap

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

## 7. Enrich Over Time

The best operating model is:

- keep `core/` stable
- let Claude update `dynamic/` when something durable is learned
- use `inbox/` for rough notes and uncertain ideas
- review core update proposals manually
