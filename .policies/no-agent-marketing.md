# No Agent Marketing Policy (Strict)

This document defines the strict policy for prohibiting agent marketing material in project artifacts.

## Core Principle

**Commits, pull requests, issues, and comments must not contain promotional material for AI tools.** We are not paid for this advertising and it does not belong in our project history.

## The Rule

| Artifact | Prohibited content |
|----------|-------------------|
| Commit messages | Co-Authored-By trailers referencing AI agents; marketing footers |
| PR titles | "Generated with...", "Built with...", or similar AI tool attributions |
| PR descriptions | Marketing footers, AI tool attribution links, co-author trailers |
| Issues | AI tool attribution or promotional footers |
| Comments | AI tool attribution or promotional footers |

### Patterns that violate this policy

- `Co-Authored-By:` trailers referencing AI agents (Claude, Copilot, ChatGPT, Gemini, Cursor, etc.)
- `Co-Authored-By:` trailers using agent noreply addresses (e.g. `noreply@anthropic.com`, `noreply@github.com`)
- Footers like "Generated with [Tool Name]", "Built with [Tool Name]", "Created using [Tool Name]"
- Markdown-link attributions like `Generated with [Claude Code](https://...)`

## Examples

### Compliant: Clean commit message

```
feat(worker): add request batching support
```

### Compliant: PR description without marketing

```markdown
## Motivation

Workers currently process requests one at a time.

## Approach

Add a batching queue that groups requests by type.
```

### Non-Compliant: Co-author trailer for AI agent

```
feat(worker): add request batching support

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

### Non-Compliant: Marketing footer in PR body

```markdown
## Motivation

Workers currently process requests one at a time.

## Approach

Add a batching queue that groups requests by type.

🤖 Generated with [Claude Code](https://claude.ai/claude-code)
```

### Non-Compliant: Attribution in PR title

```
feat(worker): add request batching support (built with Copilot)
```

## Verification Checklist

Before marking a review complete, verify:

- [ ] No commit messages contain `Co-Authored-By:` referencing AI agents
- [ ] PR title does not contain AI tool attributions
- [ ] PR description does not contain marketing footers or attribution links
- [ ] No "Generated with", "Built with", or "Created using" followed by an AI tool name

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Leaving default Co-Authored-By trailer from AI tool | Remove the trailer from the commit message |
| Forgetting to remove "Generated with..." footer from PR template | Delete the footer line |
| Including AI tool attribution in a markdown link | Remove the entire attribution line |

## Related Policies

- [Policies Index](./index.md)
