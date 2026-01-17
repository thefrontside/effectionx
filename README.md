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
pnpm check          # Type-check all packages
pnpm lint           # Lint all packages
pnpm format         # Format all files
pnpm format:check   # Check formatting
pnpm sync:tsrefs    # Check tsconfig references
pnpm sync:tsrefs:fix # Fix tsconfig references and dependencies
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
     "dependencies": {
       "effection": "^3"
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
6. Run `pnpm sync:tsrefs:fix` to update dependencies
7. Add a `README.md` (text before `---` will be used as a description)
8. Add your source code and export it from `mod.ts`
9. Add doc strings to your source code - they will be used for documentation

## Publishing

Packages are automatically published to NPM when merged to main. To publish a new version:

1. Update the version in the package's `package.json`
2. Merge to main
3. The CI will automatically publish if the version doesn't exist on NPM

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
