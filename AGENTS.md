# Agents

This repository uses AI agents to assist with development tasks. This file provides entry points for agent discovery.

## Effection

This repository builds on [Effection](https://github.com/thefrontside/effection), a structured concurrency library. Before working with code here, read the [Effection AGENTS.md](https://github.com/thefrontside/effection/blob/v4/AGENTS.md) for essential concepts:

- Operations vs Promises (lazy vs eager execution)
- Scope ownership and structured concurrency
- Entry points (`main()`, `run()`, `createScope()`)
- Streams, channels, and the `each()` pattern

## Available Agents

| Agent | Purpose | Location |
|-------|---------|----------|
| [Policy Officer](.agents/policy-officer.md) | Enforces code and documentation policies | `.agents/policy-officer.md` |

## Policies

Static analysis policies are documented in [`.agents/policies/`](.agents/policies/index.md). The Policy Officer agent uses these to verify compliance.

## For AI Agents

When working in this repository:

1. **Read this file first** to understand available agents and policies
2. **Check applicable policies** before making changes (see `.agents/policies/index.md`)
3. **Follow progressive disclosure** - start with index files, then drill into specifics as needed
