# Claude Code Configuration

## Pull Request Template

When creating pull requests, load and use the template from
`.github/pull_request_template.md`.

## Development Commands

- `deno task test` - Run tests for packages
- `deno cache --reload` - Refresh dependency cache
- `deno task publisher` - Run ex-publisher CLI tool

## ex-publisher Implementation Guidelines

### Technology Stack

**Core Technologies:**
- **Runtime**: Deno (primary), Node.js (for testing compatibility)
- **Control Flow**: Effection v3.6.0 (use generators instead of async/await)
- **CLI Framework**: zod-opts for command parsing and validation
- **Schema Validation**: Zod for type-safe configuration and argument parsing
- **Context Management**: @effectionx/context-api for dependency injection
- **Logging**: Custom logger using @effectionx/context-api with colored console output
- **Testing**: Deno's built-in test runner with BDD-style tests
- **Process Execution**: Deno subprocess API for external commands

**File System Structure:**
- Commands in `tasks/ex-publisher/commands/`
- Shared utilities in `tasks/ex-publisher/lib/`
- Configuration types in `tasks/ex-publisher/types.ts`
- Generated artifacts in extension directories (gitignored)

### Implementation Process

**Phase 1: Core Infrastructure (✅ Complete)**
1. ✅ CLI command structure with zod-opts
2. ✅ Logging system with @effectionx/context-api
3. ✅ Type definitions with Zod schemas
4. ✅ Basic command scaffolding

**Phase 2: Extension Discovery & Analysis**
1. File system scanning for extension directories
2. Configuration loading from `ex-publisher.ts` files
3. Version detection from deno.json/package.json
4. Effection compatibility validation

**Phase 3: Verification System**
1. Import map generation for different Effection versions
2. Deno test execution with custom import maps
3. DNT (Deno Node Transform) integration
4. Node.js test execution
5. Linting integration

**Phase 4: Planning & Publishing**
1. Version comparison logic (local vs published)
2. Publication plan generation
3. Registry publishing (JSR/NPM)
4. Error handling and retry logic
5. State persistence for partial failures

### Coding Standards

**Effection Patterns:**
- Use `function*` generators instead of `async function`
- Use `yield*` for operation composition
- Wrap external async APIs in Effection operations using `until`
- Handle cleanup in `try/finally` blocks

**Effection Rosetta Stone (Promise → Operation conversion):**
```typescript
// ❌ Don't use promises directly
const result = await someAsyncFunction();

// ✅ Convert promises to operations with until
import { until } from 'effection';
const result = yield* until(someAsyncFunction());

// ❌ Don't use async/await
async function myFunction() {
  const data = await fetch('/api');
  return data.json();
}

// ✅ Use generators with until for async operations
function* myFunction(): Operation<any> {
  const response = yield* until(fetch('/api'));
  const data = yield* until(response.json());
  return data;
}
```

**Error Handling:**
- Use structured error types
- Log errors with context
- Support partial failure recovery
- Store error state for retry logic

**Testing Approach:**
- **TDD (Test-Driven Development)**: Write tests first, then implement
- Test each command in isolation
- Mock external dependencies (file system, network)
- Use BDD-style test structure
- Test both success and failure scenarios
- Keep `it` pure by running side effects causing utilities into beforeEach

**TDD Workflow:**
1. User specifies test requirements
2. Claude writes the tests based on requirements
3. User confirms tests are correct
4. Claude implements code to make tests pass
5. Refactor if needed while keeping tests green

**Mocking Strategy:**

- Prefer Context API and around
- See logger and fetch context as an example


**Configuration Management:**
- Use Zod schemas for all configuration
- Validate configuration at load time
- Provide clear error messages for invalid config
- Support both CLI flags and config files

## Session Management

### Save Session Command

Use `/save-session` to export and save the current Claude Code chat session. This command:

1. **Exports chat session** using Claude Code MCP to a temporary file
2. **Copies to repository** with timestamp: `chat-session-YYYYMMDD-HHMMSS.md`
3. **Creates git commit** with:
   - The chat session file
   - Complete chat content in commit message
   - Restoration instructions in commit header
   - Environment context and project state
4. **Compact** using Claude Code MCP

### Restoring Sessions

To restore a saved session:

1. **Find the session commit**: `git log --oneline --grep="Save Claude Code chat session"`
2. **Checkout the commit**: `git checkout <commit-hash>`
3. **Read the chat file**: `cat chat-session-*.md`
4. **Start new Claude Code session** with this prompt:
   ```
   Load the context from the following chat session and continue where we left off: 
   [paste the content from the .md file]
   ```

This workflow preserves complete chat context, environment state, and project information for seamless session restoration.
