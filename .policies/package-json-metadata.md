# Package.json Metadata Policy (Strict)

This document defines the strict policy for required metadata fields in package.json.

## Core Principle

**Every published package must include `description` and `keywords` fields in package.json to enable npm search, AI agent discovery, and website categorization.**

## The Rule

| Field | Requirement | Format |
|-------|-------------|--------|
| `description` | Required for all published packages | Single sentence, under 120 characters |
| `keywords` | Required for all published packages | Array of category keywords |

### Description Guidelines

- Write for npm search and AI agent discovery
- Use present tense, active voice
- Start with a verb or noun describing what the package does
- No Markdown formatting
- No trailing period
- Under 120 characters

### Keywords Guidelines

Keywords are used to categorize packages on the website and in llms.txt. Each package must include at least one keyword from the approved categories:

| Keyword | Category | Use for packages that... |
|---------|----------|--------------------------|
| `testing` | Testing | provide test utilities, assertions, or test framework adapters |
| `io` | I/O & Network | handle file systems, HTTP, WebSockets, or network operations |
| `process` | Processes | spawn or manage child processes |
| `streams` | Streams | provide stream utilities, transformations, or adapters |
| `concurrency` | Concurrency | manage concurrent operations, task buffers, or timeouts |
| `reactivity` | Reactivity | provide reactive primitives like signals or computed values |
| `interop` | Interop | bridge Effection with other libraries or paradigms |
| `platform` | Platform | provide browser or runtime-specific APIs |

- Include all applicable keywords (packages can appear in multiple categories)
- Order keywords by relevance (most relevant first)
- Use only the approved keywords listed above

## Examples

### Compliant: Complete metadata with description and keywords

```json
{
  "name": "@effectionx/process",
  "description": "Spawn and manage child processes with structured concurrency",
  "keywords": ["process"]
}
```

```json
{
  "name": "@effectionx/websocket",
  "description": "WebSocket client with stream-based message handling and automatic cleanup",
  "keywords": ["io"]
}
```

```json
{
  "name": "@effectionx/node",
  "description": "Node.js stream and event emitter adapters for Effection",
  "keywords": ["io", "streams"]
}
```

```json
{
  "name": "@effectionx/converge",
  "description": "Poll and wait for conditions to be met with automatic retry and timeout",
  "keywords": ["testing", "concurrency"]
}
```

### Non-Compliant: Missing description or keywords

```json
{
  "name": "@effectionx/process",
  "version": "1.0.0"
  // BAD: no description or keywords fields
}
```

```json
{
  "name": "@effectionx/process",
  "description": "Spawn and manage child processes with structured concurrency"
  // BAD: missing keywords field
}
```

### Non-Compliant: Too verbose or contains markdown

```json
{
  "name": "@effectionx/process",
  "description": "This package provides a comprehensive set of utilities for spawning and managing child processes using the Effection structured concurrency library, including support for stdin/stdout streaming."
  // BAD: too long (over 120 chars), starts with "This package"
}
```

```json
{
  "name": "@effectionx/process",
  "description": "Spawn processes with `Effection` structured concurrency."
  // BAD: contains markdown backticks and trailing period
}
```

### Non-Compliant: Invalid keywords

```json
{
  "name": "@effectionx/process",
  "description": "Spawn and manage child processes with structured concurrency",
  "keywords": ["child-process", "spawn"]
  // BAD: uses custom keywords instead of approved categories
}
```

## Verification Checklist

Before marking a review complete, verify:

- [ ] `description` field is present in package.json
- [ ] Description is under 120 characters
- [ ] Description does not contain Markdown formatting
- [ ] Description does not have a trailing period
- [ ] Description starts with an action verb or noun (not "This package..." or "A library for...")
- [ ] `keywords` field is present in package.json
- [ ] Keywords array contains at least one approved category keyword
- [ ] All keywords are from the approved list (testing, io, process, streams, concurrency, reactivity, interop, platform)

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Missing description entirely | Add a concise description field |
| Missing keywords entirely | Add keywords array with at least one category |
| Starting with "This package..." | Start with what it does: "Spawn processes..." |
| Starting with "A library for..." | Start with the action: "Reactive signals..." |
| Including markdown (`backticks`, **bold**) | Use plain text only |
| Ending with a period | Remove trailing punctuation |
| Over 120 characters | Shorten to essential functionality |
| Using custom/arbitrary keywords | Use only approved category keywords |

## Related Policies

- [Policies Index](./index.md)
