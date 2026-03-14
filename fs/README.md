# FS

File system operations for Effection programs. This package wraps Node.js
`fs/promises` APIs as Effection Operations with structured concurrency support.

> **Note**: Starting with version 0.3.0, this package requires Effection v4.1 or greater
> for full functionality. The middleware/API features (`fsApi`) require the new
> `createApi` function introduced in Effection v4.1.

---

## Installation

```bash
npm install @effectionx/fs
```

## Basic Usage

```typescript
import { main } from "effection";
import { exists, readTextFile, writeTextFile } from "@effectionx/fs";

await main(function* () {
  if (yield* exists("./config.json")) {
    const config = yield* readTextFile("./config.json");
    console.log(JSON.parse(config));
  } else {
    yield* writeTextFile("./config.json", JSON.stringify({ version: 1 }));
  }
});
```

## File Operations

### stat()

Get file or directory stats.

```typescript
import { stat } from "@effectionx/fs";

const stats = yield* stat("./file.txt");
console.log(stats.isFile()); // true
console.log(stats.size); // file size in bytes
```

### lstat()

Get file or directory stats without following symlinks.

```typescript
import { lstat } from "@effectionx/fs";

const stats = yield* lstat("./symlink");
console.log(stats.isSymbolicLink()); // true
```

### exists()

Check if a file or directory exists.

```typescript
import { exists } from "@effectionx/fs";

if (yield* exists("./config.json")) {
  console.log("Config file found");
}
```

### readTextFile()

Read a file as text.

```typescript
import { readTextFile } from "@effectionx/fs";

const content = yield* readTextFile("./README.md");
```

### writeTextFile()

Write text to a file.

```typescript
import { writeTextFile } from "@effectionx/fs";

yield* writeTextFile("./output.txt", "Hello, World!");
```

### ensureFile()

Ensure a file exists, creating parent directories and the file if needed.

```typescript
import { ensureFile } from "@effectionx/fs";

yield* ensureFile("./data/logs/app.log");
```

### copyFile()

Copy a file.

```typescript
import { copyFile } from "@effectionx/fs";

yield* copyFile("./source.txt", "./backup.txt");
```

### rm()

Remove a file or directory.

```typescript
import { rm } from "@effectionx/fs";

// Remove a file
yield* rm("./temp.txt");

// Remove a directory recursively
yield* rm("./temp", { recursive: true });

// Force remove (no error if doesn't exist)
yield* rm("./maybe-exists", { force: true });
```

## Directory Operations

### ensureDir()

Ensure a directory exists, creating it recursively if needed.

```typescript
import { ensureDir } from "@effectionx/fs";

yield* ensureDir("./data/cache/images");
```

### readdir()

Read the contents of a directory.

```typescript
import { readdir } from "@effectionx/fs";

const entries = yield* readdir("./src");
console.log(entries); // ["index.ts", "utils.ts", ...]
```

### emptyDir()

Empty a directory by removing all its contents. Creates the directory if it
doesn't exist.

```typescript
import { emptyDir } from "@effectionx/fs";

yield* emptyDir("./dist");
```

### walk()

Walk a directory tree and yield entries as a Stream.

```typescript
import { walk } from "@effectionx/fs";
import { each } from "effection";

for (const entry of yield* each(walk("./src"))) {
  if (entry.isFile && entry.name.endsWith(".ts")) {
    console.log(entry.path);
  }
  yield* each.next();
}
```

Each entry includes:
- `path` - Full path to the entry
- `name` - Basename of the entry
- `isFile` - Whether it's a file
- `isDirectory` - Whether it's a directory
- `isSymlink` - Whether it's a symbolic link

#### Walk Options

```typescript
walk("./src", {
  includeDirs: true,      // Include directories (default: true)
  includeFiles: true,     // Include files (default: true)
  includeSymlinks: true,  // Include symlinks (default: true)
  match: [/\.ts$/],       // Only include matching paths
  skip: [/node_modules/], // Exclude matching paths
  maxDepth: 3,            // Maximum traversal depth
  followSymlinks: false,  // Follow symbolic links (default: false)
});
```

### expandGlob()

Expand glob patterns and yield matching paths as a Stream.

```typescript
import { expandGlob } from "@effectionx/fs";
import { each } from "effection";

for (const entry of yield* each(expandGlob("./src/**/*.ts"))) {
  console.log(entry.path);
  yield* each.next();
}
```

#### Glob Options

```typescript
expandGlob("**/*.ts", {
  root: "./src",          // Root directory (default: ".")
  exclude: ["**/*.test.ts"], // Patterns to exclude
  includeDirs: false,     // Include directories (default: true)
  followSymlinks: false,  // Follow symbolic links (default: false)
});
```

## Utilities

### toPath()

Convert a path or URL to a file path string.

```typescript
import { toPath } from "@effectionx/fs";

toPath("./file.txt");           // "./file.txt"
toPath(new URL("file:///tmp")); // "/tmp"
```

### globToRegExp()

Convert a glob pattern to a RegExp.

```typescript
import { globToRegExp } from "@effectionx/fs";

const regex = globToRegExp("*.ts");
regex.test("file.ts");  // true
regex.test("file.js");  // false

// Supports extended glob syntax
globToRegExp("**/*.{ts,js}");     // Match .ts or .js files recursively
globToRegExp("file[0-9].txt");    // Character classes
globToRegExp("src/**/test?.ts");  // ? matches single character
```

### URL Conversion

Re-exported from `node:url` for convenience:

```typescript
import { fromFileUrl, toFileUrl } from "@effectionx/fs";

fromFileUrl(new URL("file:///tmp/file.txt")); // "/tmp/file.txt"
toFileUrl("/tmp/file.txt");                    // URL { href: "file:///tmp/file.txt" }
```

## Path and URL Support

All file operations accept either a string path or a `URL` object:

```typescript
import { readTextFile } from "@effectionx/fs";

// String path
yield* readTextFile("./config.json");

// URL object
yield* readTextFile(new URL("file:///etc/config.json"));

// import.meta.url based paths
yield* readTextFile(new URL("./data.json", import.meta.url));
```

## Middleware Support

### `fsApi`

The file system API object that supports middleware decoration. Use `fsApi.around()`
to add middleware for logging, mocking, or instrumentation.

```typescript
import { fsApi, readTextFile } from "@effectionx/fs";
import { run } from "effection";

// Add logging middleware
await run(function* () {
  yield* fsApi.around({
    *readTextFile(args, next) {
      let [pathOrUrl] = args;
      console.log("Reading:", pathOrUrl);
      return yield* next(...args);
    },
  });

  // All readTextFile calls in this scope now log
  let content = yield* readTextFile("./config.json");
});
```

#### Mocking files for testing

```typescript
import { fsApi, readTextFile } from "@effectionx/fs";
import { run } from "effection";

await run(function* () {
  yield* fsApi.around({
    *readTextFile(args, next) {
      let [pathOrUrl] = args;
      if (String(pathOrUrl).includes("config.json")) {
        // Return mock content
        return JSON.stringify({ mock: true, env: "test" });
      }
      return yield* next(...args);
    },
  });

  // This returns mocked content in this scope
  let config = yield* readTextFile("./config.json");
});
```

#### Interceptable operations

The following operations can be intercepted via `fsApi.around()`:

- `stat(pathOrUrl)` - Get file stats
- `lstat(pathOrUrl)` - Get file stats (no symlink follow)
- `readTextFile(pathOrUrl)` - Read file as text
- `writeTextFile(pathOrUrl, content)` - Write text to file
- `rm(pathOrUrl, options?)` - Remove file or directory
- `readdir(pathOrUrl)` - Read directory entries

Middleware is scoped - it only applies to the current scope and its children,
and is automatically cleaned up when the scope exits.
