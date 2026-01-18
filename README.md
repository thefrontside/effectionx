# effectionx

This repository contains a collection of community contributions built on top of the [Effection](https://frontside.com/effection) structured concurrency library. All packages are published to NPM under the `@effectionx` scope.

## Development

This repository uses [Volta](https://volta.sh/) to manage Node.js and pnpm versions. The versions are pinned in `package.json`.

### Prerequisites

Install Volta if you haven't already:

```bash
curl https://get.volta.sh | bash
```

Volta will automatically install the correct Node.js and pnpm versions when you run commands in this repository.

### Setup

```bash
pnpm install
```

### Available Commands

```bash
pnpm build          # Build all packages
pnpm test           # Run all tests
pnpm test:matrix    # Test against all supported peer dependency versions
pnpm check          # Type-check all packages
pnpm lint           # Lint all packages
pnpm fmt            # Format all files
pnpm fmt:check      # Check formatting
pnpm sync           # Check tsconfig references
pnpm sync:fix       # Fix tsconfig references and dependencies
```

### Testing Against Multiple Peer Dependency Versions

Packages in this repository declare their compatible versions for peer dependencies
like Effection, Vitest, etc. via `peerDependencies`. To verify compatibility across
the full range of supported versions, run:

```bash
pnpm test:matrix
```

This command:
1. Reads each package's `peerDependencies` (e.g., `effection`, `vitest`)
2. Resolves the minimum and maximum versions that satisfy each range
3. Generates a cartesian product matrix of all version combinations
4. For each combination, installs the specific versions and runs tests
5. Reports a compatibility matrix showing pass/fail status per combination

For example, a package with `effection: "^3 || ^4"` and `vitest: "^3 || ^4"` will
be tested with all four combinations: e3+v3, e3+v4, e4+v3, e4+v4.

This ensures packages work correctly with both the oldest supported versions
and the latest releases of all peer dependencies.

#### How the Matrix Test Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         pnpm test:matrix                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. Read peerDependencies from all workspace packages                       │
│                                                                             │
│     @effectionx/bdd        → effection: "^3 || ^4"                          │
│     @effectionx/vitest     → effection: "^3 || ^4", vitest: "^3 || ^4"      │
│     @effectionx/process    → effection: "^3 || ^4"                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. Fetch versions from npm & resolve min/max for each range                │
│                                                                             │
│     effection "^3 || ^4"  → [3.0.0, 4.0.0]                                  │
│     vitest "^3 || ^4"     → [3.0.0, 4.0.0]                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. Generate cartesian product matrix                                       │
│                                                                             │
│     ┌─────────────────┬─────────────────┬──────────────────────────────┐    │
│     │ effection       │ vitest          │ packages                     │    │
│     ├─────────────────┼─────────────────┼──────────────────────────────┤    │
│     │ 3.0.0           │ -               │ bdd, process, chain, ...     │    │
│     │ 4.0.0           │ -               │ bdd, process, chain, ...     │    │
│     │ 3.0.0           │ 3.0.0           │ vitest                       │    │
│     │ 3.0.0           │ 4.0.0           │ vitest                       │    │
│     │ 4.0.0           │ 3.0.0           │ vitest                       │    │
│     │ 4.0.0           │ 4.0.0           │ vitest                       │    │
│     └─────────────────┴─────────────────┴──────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4. For each matrix entry:                                                  │
│                                                                             │
│     a. Set pnpm overrides (e.g., pnpm.overrides.effection=3.0.0)            │
│     b. Install dependencies with overrides applied                          │
│     c. Run tests for applicable packages                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  5. Print summary table                                                     │
│                                                                             │
│     effection    vitest      Packages  Passed    Failed    Status           │
│     ───────────────────────────────────────────────────────────────         │
│     3.0.0        -           15        150       0         PASS             │
│     4.0.0        -           15        150       0         PASS             │
│     3.0.0        3.0.0       1         6         0         PASS             │
│     4.0.0        4.0.0       1         6         0         PASS             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Running Tests for a Specific Package

```bash
cd <package-name>
node --env-file=../.env --test "*.test.ts"
```

## Adding a New Package

1. Create a directory for your package
2. Add a `package.json`:

   ```json
   {
     "name": "@effectionx/your-package",
     "version": "0.1.0",
     "type": "module",
     "license": "MIT",
     "exports": {
       ".": {
         "development": "./mod.ts",
         "default": "./dist/mod.js"
       }
     },
     "files": ["dist", "mod.ts", "src"],
     "scripts": {
       "test": "node --env-file=../.env --test \"*.test.ts\""
     },
      "peerDependencies": {
        "effection": "^3 || ^4"
      }
   }
   ```

3. Add a `tsconfig.json`:

   ```json
   {
     "extends": "../tsconfig.json",
     "compilerOptions": {
       "outDir": "dist",
       "rootDir": "."
     },
     "include": ["**/*.ts"],
     "exclude": ["**/*.test.ts", "dist"],
     "references": []
   }
   ```

4. Add your package to `pnpm-workspace.yaml`
5. Add your package to `tsconfig.json` references
6. Run `pnpm sync:fix` to update dependencies
7. Add a `README.md` (text before `---` will be used as a description)
8. Add your source code and export it from `mod.ts`
9. Add doc strings to your source code - they will be used for documentation

## Publishing

Packages are automatically published to NPM when merged to main using OIDC-based authentication with provenance attestation.

### How It Works

1. Update the version in the package's `package.json`
2. Merge to main
3. The CI will automatically publish if the version doesn't exist on NPM

### First-Time Publish (New Packages)

For packages that don't exist on NPM yet, OIDC cannot be used. The workflow requires an `NPM_PUBLISH_TOKEN` secret for the initial publish.

**Setup for first publish:**

1. Create an npm automation token at https://www.npmjs.com/settings/tokens
2. Add it as a repository secret named `NPM_PUBLISH_TOKEN`
3. Merge to main - the workflow will use the token for the first publish

### Configuring OIDC (After First Publish)

After a package is published for the first time, configure OIDC to enable tokenless publishing:

1. Go to `https://www.npmjs.com/package/@effectionx/<package-name>/access`
2. Under **Publishing access**, select **Require two-factor authentication or an automation token or OIDC**
3. Under **Configure OIDC publishing**, add:
   - **Repository**: `thefrontside/effectionx`
   - **Workflow**: `.github/workflows/publish.yaml`

Once OIDC is configured, the package will publish automatically without needing a token.

## Project Structure

```
.internal/          # Internal tooling scripts (not published)
<package>/          # Package directories
  mod.ts            # Main entry point
  *.test.ts         # Tests
  package.json      # Package manifest
  tsconfig.json     # TypeScript config
  README.md         # Package documentation
```
