# @effectionx/project-repo

Project repository utilities for [Effection](https://frontside.com/effection) - manage worktrees, clones, and repository tags with structured concurrency.

## Installation

```bash
npm install @effectionx/project-repo
```

## Features

- **Worktrees**: Create and manage git worktrees for parallel version checkouts
- **Clones**: Clone and cache GitHub repositories
- **Repository**: Query git tags with semver sorting
- **Semver**: Extract and compare semantic versions from tag names

## Usage

### Worktrees

Manage git worktrees for checking out multiple refs simultaneously:

```typescript
import { main } from "effection";
import { initWorktrees, useWorktree } from "@effectionx/project-repo";

await main(function* () {
  // Initialize the worktrees directory
  yield* initWorktrees("./build/worktrees");

  // Create worktrees for different versions
  const v3Path = yield* useWorktree("v3.0.0");
  const v4Path = yield* useWorktree("v4.0.0");

  console.log(`v3 at: ${v3Path}`);
  console.log(`v4 at: ${v4Path}`);
});
```

### Clones

Clone and cache GitHub repositories:

```typescript
import { main } from "effection";
import { initClones, useClone } from "@effectionx/project-repo";

await main(function* () {
  // Initialize the clones directory
  yield* initClones("./build/clones");

  // Clone repositories (cached if already exists)
  const effectionPath = yield* useClone("thefrontside/effection");
  const effectionxPath = yield* useClone("thefrontside/effectionx");

  console.log(`Effection at: ${effectionPath}`);
});
```

### Repository Tags

Query and sort git tags by semver:

```typescript
import { main } from "effection";
import { createRepo } from "@effectionx/project-repo";

await main(function* () {
  const repo = createRepo({
    owner: "thefrontside",
    name: "effection",
  });

  // Get all v4.x tags
  const v4Tags = yield* repo.tags(/^v4\./);
  console.log("v4 tags:", v4Tags.map((t) => t.name));

  // Get the latest v4.x tag
  const latest = yield* repo.latest(/^v4\./);
  console.log(`Latest: ${latest.name}`);
  console.log(`URL: ${latest.url}`);
});
```

### Semver Utilities

Extract and compare versions from tag names:

```typescript
import { extractVersion, findLatestSemverTag } from "@effectionx/project-repo";

// Extract version from tag name
extractVersion("v3.2.1"); // "3.2.1"
extractVersion("release-1.0.0-beta.1"); // "1.0.0-beta.1"

// Find the latest tag from a list
const tags = [{ name: "v1.0.0" }, { name: "v2.0.0" }, { name: "v1.5.0" }];

const latest = findLatestSemverTag(tags);
console.log(latest?.name); // "v2.0.0"
```

## API

### Worktrees

- `initWorktrees(basePath, options?)` - Initialize the worktrees base directory
- `useWorktree(refname)` - Get or create a worktree for a git ref

### Clones

- `initClones(basePath, options?)` - Initialize the clones base directory
- `useClone(nameWithOwner)` - Clone or use cached GitHub repository

### Repository

- `createRepo(options)` - Create a repository abstraction
- `repo.tags(pattern)` - Get tags matching a regex pattern
- `repo.latest(pattern)` - Get the latest semver tag matching a pattern

### Semver

- `extractVersion(input)` - Extract semver from a string
- `findLatestSemverTag(tags)` - Find the latest tag by semver

## Requirements

- Node.js >= 22
- Effection ^3 || ^4
- Git must be installed and available in PATH

## License

MIT
