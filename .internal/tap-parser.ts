import type { Operation, Stream } from "effection";
import { parse as parseYaml } from "yaml";

/**
 * Metadata extracted from TAP YAML blocks.
 */
export interface TapMetadata {
  duration_ms?: number;
  type?: "test" | "suite";
  location?: string;
  failureType?: string;
  error?: string;
  stack?: string;
  code?: string;
  expected?: unknown;
  actual?: unknown;
}

/**
 * A parsed TAP test result.
 */
export interface TapTestResult {
  status: "ok" | "not ok";
  number: number;
  name: string;
  indent: number;
  metadata?: TapMetadata;
}

// Regex patterns for TAP parsing
const STATUS_LINE_REGEX = /^(\s*)(ok|not ok)\s+(\d+)\s*(?:-\s*)?(.*)$/;
const YAML_START_REGEX = /^(\s*)---\s*$/;
const YAML_END_REGEX = /^(\s*)\.\.\.\s*$/;

type ParserState =
  | { type: "idle" }
  | {
      type: "pending_yaml";
      result: TapTestResult;
      expectedIndent: number;
    }
  | {
      type: "in_yaml";
      result: TapTestResult;
      yamlLines: string[];
      baseIndent: number;
    };

/**
 * Stream helper that parses TAP output lines into structured test results.
 *
 * Extracts test status (ok/not ok), test name, and YAML metadata blocks.
 * YAML blocks between `---` and `...` are parsed to extract error details,
 * stack traces, and other metadata.
 *
 * @example
 * ```ts
 * import { parseTapResults } from "./tap-parser.ts";
 * import { lines } from "@effectionx/stream-helpers";
 * import { pipe, each } from "effection";
 *
 * const results = pipe(proc.stdout, lines(), parseTapResults());
 * for (const result of yield* each(results)) {
 *   if (result.status === "not ok") {
 *     console.log(`FAIL: ${result.name}`);
 *   }
 *   yield* each.next();
 * }
 * ```
 */
export function parseTapResults<TClose>(): (
  stream: Stream<string, TClose>,
) => Stream<TapTestResult, TClose> {
  return (stream: Stream<string, TClose>) => ({
    *[Symbol.iterator]() {
      const subscription = yield* stream;
      let state: ParserState = { type: "idle" };
      const pending: TapTestResult[] = [];

      return {
        *next(): Operation<IteratorResult<TapTestResult, TClose>> {
          while (true) {
            // Return pending results first
            const next = pending.shift();
            if (next) {
              return { done: false, value: next };
            }

            // Get next line
            const lineResult = yield* subscription.next();
            if (lineResult.done) {
              // Emit any pending result before closing
              if (state.type === "pending_yaml") {
                pending.push(state.result);
                state = { type: "idle" };
              } else if (state.type === "in_yaml") {
                // Parse incomplete YAML and emit
                const metadata = parseYamlBlock(
                  state.yamlLines,
                  state.baseIndent,
                );
                if (metadata) {
                  state.result.metadata = metadata;
                }
                pending.push(state.result);
                state = { type: "idle" };
              }

              const finalResult = pending.shift();
              if (finalResult) {
                return { done: false, value: finalResult };
              }
              return { done: true, value: lineResult.value };
            }

            const line = lineResult.value;
            processLine(line, state, pending, (newState) => {
              state = newState;
            });
          }
        },
      };
    },
  });
}

function processLine(
  line: string,
  state: ParserState,
  pending: TapTestResult[],
  setState: (s: ParserState) => void,
): void {
  if (state.type === "idle") {
    // Look for status line
    const match = STATUS_LINE_REGEX.exec(line);
    if (match) {
      const [, indent, status, num, name] = match;
      const result: TapTestResult = {
        status: status as "ok" | "not ok",
        number: Number.parseInt(num, 10),
        name: name.trim(),
        indent: indent.length,
      };
      // Move to pending_yaml state to check for YAML block
      setState({
        type: "pending_yaml",
        result,
        expectedIndent: indent.length,
      });
    }
    // Ignore other lines (comments, plan lines, etc.)
  } else if (state.type === "pending_yaml") {
    // Check if this line starts a YAML block
    const yamlStartMatch = YAML_START_REGEX.exec(line);
    if (yamlStartMatch) {
      const yamlIndent = yamlStartMatch[1].length;
      // YAML block should be indented more than the status line
      if (yamlIndent > state.expectedIndent) {
        setState({
          type: "in_yaml",
          result: state.result,
          yamlLines: [],
          baseIndent: yamlIndent,
        });
        return;
      }
    }

    // Check if this is another status line (no YAML for previous result)
    const statusMatch = STATUS_LINE_REGEX.exec(line);
    if (statusMatch) {
      // Emit the previous result without metadata
      pending.push(state.result);

      const [, indent, status, num, name] = statusMatch;
      const result: TapTestResult = {
        status: status as "ok" | "not ok",
        number: Number.parseInt(num, 10),
        name: name.trim(),
        indent: indent.length,
      };
      setState({
        type: "pending_yaml",
        result,
        expectedIndent: indent.length,
      });
      return;
    }

    // Any other line means no YAML block for this result
    // But don't emit yet - could be a comment line before YAML
    // Actually, let's be strict: if next line isn't ---, emit the result
    // Check if it's a comment or subtest header
    if (line.trim().startsWith("#") || line.trim() === "") {
      // Ignore comments and blank lines, stay in pending_yaml
      return;
    }

    // Not a YAML start, not another status line, not a comment
    // Emit the result and go back to idle
    pending.push(state.result);
    setState({ type: "idle" });
  } else if (state.type === "in_yaml") {
    // Check for YAML end marker
    const yamlEndMatch = YAML_END_REGEX.exec(line);
    if (yamlEndMatch) {
      // Parse the collected YAML
      const metadata = parseYamlBlock(state.yamlLines, state.baseIndent);
      if (metadata) {
        state.result.metadata = metadata;
      }
      pending.push(state.result);
      setState({ type: "idle" });
      return;
    }

    // Collect YAML line
    state.yamlLines.push(line);
  }
}

function parseYamlBlock(
  lines: string[],
  baseIndent: number,
): TapMetadata | undefined {
  if (lines.length === 0) {
    return undefined;
  }

  // Strip the base indentation from all lines
  const stripped = lines.map((line) => {
    if (line.length >= baseIndent) {
      return line.slice(baseIndent);
    }
    // Line is shorter than expected indent - probably empty or whitespace only
    return line.trimStart();
  });

  const yamlText = stripped.join("\n");

  try {
    const parsed = parseYaml(yamlText) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }

    return {
      duration_ms:
        typeof parsed.duration_ms === "number" ? parsed.duration_ms : undefined,
      type:
        parsed.type === "test" || parsed.type === "suite"
          ? parsed.type
          : undefined,
      location:
        typeof parsed.location === "string" ? parsed.location : undefined,
      failureType:
        typeof parsed.failureType === "string" ? parsed.failureType : undefined,
      error: typeof parsed.error === "string" ? parsed.error : undefined,
      stack: typeof parsed.stack === "string" ? parsed.stack : undefined,
      code: typeof parsed.code === "string" ? parsed.code : undefined,
      expected: parsed.expected,
      actual: parsed.actual,
    };
  } catch {
    // YAML parse error - return undefined
    return undefined;
  }
}
