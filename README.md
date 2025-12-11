# effectionx

This repository contains a collection of contributions by the community. This
repository automatically publishes to JSR and NPM. All packages that were used
more than a few times are welcome.

## Adding a new package

1. Create a directory
2. Add a deno.json file with
   `{ "name": "@effectionx/<you_package_name>", version: "0.1.0", "exports": "./mod.ts", "license": "MIT" }`
3. Add a README.md (text before `---` will be used as a description for the
   package)
4. Add your source code and export it from `mod.ts`
5. Add doc strings to your source code - they will be used for documentation on
   the site.

## Testing

All packages are tested against both effection v3 and v4 to ensure
compatibility.

### Deno Testing

#### Generate import maps

```bash
# Generate v3 import map
deno task generate-importmap "^3" v3.importmap.json

# Generate v4 import map (fetches latest v4 from npm)
deno task generate-importmap v4 v4.importmap.json
```

#### Running tests with v3

```bash
deno test --import-map v3.importmap.json -A
```

#### Running tests with v4

```bash
deno test --import-map v4.importmap.json -A
```

### Node.js Testing

Packages with Node.js support have a `package.json` with a `test` script. To run
all Node.js tests across all packages:

```bash
npm install
npm test
```

This runs `npm test --workspaces --if-present`, which executes the `test` script
in each package that has one defined.

#### Adding Node.js support to a package

1. Add a `package.json` with conditional exports:

   ```json
   {
     "name": "@effectionx/your-package",
     "type": "module",
     "exports": {
       ".": {
         "deno": "./mod.deno.ts",
         "node": "./mod.node.ts",
         "default": "./mod.node.ts"
       }
     },
     "scripts": {
       "test": "node --experimental-strip-types --test *.test.ts"
     },
     "dependencies": {
       "effection": "^3"
     }
   }
   ```

2. Create platform-specific entry points (`mod.deno.ts`, `mod.node.ts`)
3. Add the package to the root `package.json` workspaces array
4. Run `npm install` to link the workspace

## To publish a new project

1. Member of [jsr.io/@effectionx](https://jsr.io/@effectionx) has to add that
   project to the scope
2. It should be publish on next merge to main
