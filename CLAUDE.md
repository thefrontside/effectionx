# CLAUDE.md - Project Guidelines

## Project Overview

effectionx is a TypeScript monorepo containing community packages built on
[Effection](https://frontside.com/effection) structured concurrency library.
Packages are published to NPM under the `@effectionx` scope.

## Tech Stack

- **Runtime**: Node.js 22.12.0 (via Volta)
- **Package Manager**: pnpm 9.15.9
- **Build**: TypeScript 5+, Turbo
- **Linting/Formatting**: Biome
- **Testing**: Node.js test runner

## Code Review Policies

**IMPORTANT**: All code reviews must follow the policies in `.policies/index.md`.
Read `.agents/policy-officer.md` for the expected review format and process.

When reviewing PRs:
1. Read `.policies/index.md` to get the list of active policies
2. Read each linked policy document
3. Apply policy checks to changed files
4. Use the output format from `.agents/policy-officer.md`

## Coding Standards

### TypeScript

- Strict mode enabled
- Use `NodeNext` module resolution
- Target ES2022
- Prefer `type` imports for type-only imports
- Use explicit return types on public functions

### Biome Rules

The following rules are configured in `biome.json`:

- 2-space indentation
- Import organization enabled
- `noParameterAssign`: off (reassigning parameters is acceptable)
- `useConst`: off (let is acceptable even when const could be used)
- `noForEach`: off (forEach is acceptable in this codebase)
- `noThenProperty`: off (required for Operation/Promise interop)
- `noShadowRestrictedNames`: off (shadowing is acceptable)

### Effection Patterns

- Use structured concurrency (spawn, scope)
- Resources must clean up properly on scope exit
- Prefer `Operation<T>` for async operations
- Use `*[Symbol.iterator]` pattern for reusable stream operations (see Stateless Streams policy)
- Avoid `sleep()` for test synchronization (see No-Sleep Test Sync policy)

## Package Structure

Each package requires:

```
<package>/
├── mod.ts            # Main entry point (exports public API)
├── package.json      # Package manifest with peerDependencies
├── tsconfig.json     # Extends root tsconfig
├── *.test.ts         # Tests using Node.js test runner
└── README.md         # Documentation (text before --- used as description)
```

### package.json Requirements

- `name`: `@effectionx/<package-name>`
- `type`: `"module"`
- `exports`: Must include `development` and `default` conditions
- `peerDependencies`: Usually `effection: "^3 || ^4"`
- `files`: Include `dist`, `mod.ts`, and source files

### Test Files

- Use Node.js test runner (`node --test`)
- Import test utilities from `@effectionx/bdd` when needed
- Tests run with `--env-file=../.env`

## Commands

```bash
pnpm build          # Build all packages (TypeScript + bundling)
pnpm build:tsc      # Build TypeScript only
pnpm test           # Run all tests
pnpm test:matrix    # Test against peer dependency versions
pnpm check          # Type-check all packages
pnpm lint           # Lint all packages
pnpm fmt            # Format all files
pnpm fmt:check      # Check formatting
pnpm sync           # Check tsconfig references
pnpm sync:fix       # Fix tsconfig references and dependencies
```

## Repository Structure

```
effectionx/
├── .github/workflows/  # CI/CD workflows
├── .internal/          # Internal tooling (not published)
├── .policies/          # Code review policies
├── .agents/            # Agent instructions
├── <package>/          # Individual packages
└── package.json        # Root workspace config
```
