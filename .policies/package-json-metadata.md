# Package.json Metadata Policy (Strict)

This document defines the strict policy for required metadata fields in package.json.

## Core Principle

**Every published package must include a `description` field in package.json to enable npm search and AI agent discovery.**

## The Rule

| Field | Requirement | Format |
|-------|-------------|--------|
| `description` | Required for all published packages | Single sentence, under 120 characters |

### Description Guidelines

- Write for npm search and AI agent discovery
- Use present tense, active voice
- Start with a verb or noun describing what the package does
- No markdown formatting
- No trailing period
- Under 120 characters

## Examples

### Compliant: Concise action-oriented descriptions

```json
{
  "name": "@effectionx/process",
  "description": "Spawn and manage child processes with structured concurrency"
}
```

```json
{
  "name": "@effectionx/websocket",
  "description": "WebSocket client with structured concurrency lifecycle management"
}
```

```json
{
  "name": "@effectionx/signals",
  "description": "Reactive signals and computed values for Effection operations"
}
```

### Non-Compliant: Missing description

```json
{
  "name": "@effectionx/process",
  "version": "1.0.0"
  // BAD: no description field
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

## Verification Checklist

Before marking a review complete, verify:

- [ ] `description` field is present in package.json
- [ ] Description is under 120 characters
- [ ] Description does not contain markdown formatting
- [ ] Description does not have a trailing period
- [ ] Description starts with an action verb or noun (not "This package..." or "A library for...")

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Missing description entirely | Add a concise description field |
| Starting with "This package..." | Start with what it does: "Spawn processes..." |
| Starting with "A library for..." | Start with the action: "Reactive signals..." |
| Including markdown (`backticks`, **bold**) | Use plain text only |
| Ending with a period | Remove trailing punctuation |
| Over 120 characters | Shorten to essential functionality |

## Related Policies

- [Policies Index](./index.md)
