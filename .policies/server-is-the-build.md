# Server-Is-The-Build Policy (Recommended)

This document defines the recommended policy for build architecture.

## Core Principle

**The server is the build. There is no separate build step, only capture of what the server already serves.**

## The Rule

| Scenario | Required Approach |
|----------|-------------------|
| Asset generation (images, PDFs, etc.) | Generate on-demand via server request, cache as needed |
| Static site builds | Capture server responses (staticalize), don't run separate pipelines |
| Feature development | If it works in dev server, it works in production |

## Why This Matters

1. **Dev/prod parity**: No "works locally but fails in CI" — catch issues during development
2. **Simpler architecture**: One codepath instead of server + build script
3. **Incremental by default**: On-demand generation naturally supports partial rebuilds
4. **Debuggable**: Server requests are inspectable; build scripts are opaque

## Examples

### Compliant: On-demand OG image generation

```typescript
// Plugin generates PNG when requested, caches result
export function ogImagePlugin(): Plugin {
  return {
    *intercept(request, next) {
      if (request.url.endsWith('.png')) {
        // Generate and cache on first request
        return yield* generateOgImage(request);
      }
      return yield* next(request);
    }
  };
}
```

### Compliant: Dynamic route handling

```typescript
// Routes resolve at request time, staticalize captures them
export function blogRoutes(): Route {
  return {
    *intercept(request, next) {
      let posts = yield* loadBlogPosts();
      // ... serve dynamically, staticalize captures the result
    }
  };
}
```

### Non-Compliant: Build-time generation script

```typescript
// BAD: Separate script that runs before deploy
// scripts/generate-og-images.ts
for (let post of posts) {
  await generatePng(post.svg, `dist/${post.id}.png`);
}
```

### Non-Compliant: CI step before staticalize

```yaml
# BAD: Separate generation step in CI
jobs:
  build:
    steps:
      - run: deno task generate-assets  # <-- Violates policy
      - run: deno task staticalize
```

## Verification Checklist

- [ ] No build scripts that generate assets outside the server
- [ ] CI workflow doesn't have asset generation steps separate from staticalize
- [ ] Features work identically in `deno task dev` and production
- [ ] No "generate" or "build-assets" tasks in deno.json/package.json

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Adding a "generate" task to deno.json | Move generation to a server plugin |
| CI step that runs before staticalize | Remove step; let staticalize capture |
| Checking generated files into git | Generate on-demand; cache in runtime |
| Different codepaths for dev vs prod | Use same server logic everywhere |

## Related Policies

- [Policies Index](./index.md)
