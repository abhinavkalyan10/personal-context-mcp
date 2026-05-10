# Privacy

Personal Context MCP is designed around local, inspectable files.

## What Stays Local

Your personal context portfolio is a folder on your machine. The MCP server reads from and writes to that folder through Claude Desktop's local extension runtime.

The project does not add:

- hosted storage
- embeddings
- a vector database
- a knowledge graph
- automatic background writes
- a remote sync service

## Public Repo Boundary

The starter portfolio in this repository is intentionally blank and safe to copy.

Your filled portfolio is private data. Do not commit it to this public repository. The default quickstart folder name, `my-personal-context-portfolio/`, is ignored by this repo, but if you choose another name, keep it outside Git or add it to your own `.gitignore`.

## Trust Layers

The default portfolio structure separates context by trust level:

- `core/`: durable truth that should stay stable and manually reviewed
- `dynamic/`: working memory that can evolve over time
- `inbox/`: low-trust notes, rough observations, and proposed core updates

Runtime tools preserve that boundary. Core files are not edited directly by the proposal flow; proposed core changes land in `inbox/` for review.

## Before Sharing

Before sharing logs, screenshots, bug reports, or examples, check that they do not include your filled portfolio content, private file paths, customer names, account details, access tokens, or other personal data.
