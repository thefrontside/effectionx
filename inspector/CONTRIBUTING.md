# Contributing To The Inspector 🎯

Welcome! This document explains how to get started working on the Inspector.

## Quick start 🚀

### Install deps (from repo root):

```shell
pnpm install
```

### Run the inspector locally:

```shell
cd inspector
pnpm start
```

This runs Vite and serves the Crank-based inspector UI. Open http://localhost:5173 (or whatever Vite prints).

- Run tests & checks (from repo root):
  - Run tests: `pnpm test`
  - Run type checks: `pnpm run check`
  - Run linter: `pnpm run lint`
  - Format: `pnpm run fmt`

Note: Some checks (lint/format/test) are run at the monorepo root and cover all workspaces.

## Notes And What Is Where 👀

- Crank generator components are the UI building blocks. Many components are written as generators for render loops. They can own Effection scopes.
- Use shoelace web-components for pre-built "blocks".
- Use CSS Modules per component (`*.module.css`). Avoid placing `class` attributes directly on Shoelace (`sl-*`) elements.
- D3 owns its SVG subtree: components render an `<svg>` that D3 manages directly — avoid mixing Crank DOM updates inside D3-managed nodes.
- If working purely on the UI, the `/demo` page pulls in a static file which is useful for components feature and functionality testing. It shares components with the `/live` and `/recording` pages.
