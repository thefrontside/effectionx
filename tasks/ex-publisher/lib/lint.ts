import { Operation, until } from "npm:effection@3.6.0";
import { log } from "../logger.ts";

export interface LintOptions {
  /** Path to the package directory to lint */
  packageDir: string;
  /** Files/patterns to lint (optional, uses Deno lint defaults if not specified) */
  files?: string[];
  /** Cache directory for Deno (optional) */
  cacheDir?: string;
}

export interface LintIssue {
  /** File path where the issue occurred */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
  /** Severity level */
  severity: "error" | "warning" | "info";
  /** Issue message */
  message: string;
  /** Rule name/code that triggered this issue */
  rule?: string;
}

export interface LintResult {
  /** Whether linting passed (no errors) */
  success: boolean;
  /** Exit code from linter process */
  exitCode: number;
  /** Standard output from linter */
  stdout: string;
  /** Standard error from linter */
  stderr: string;
  /** Total number of issues found */
  issuesFound: number;
  /** Number of error-level issues */
  errors: number;
  /** Number of warning-level issues */
  warnings: number;
  /** Detailed list of all issues */
  issues: LintIssue[];
}

/**
 * Run deno lint on a package directory.
 * This function will:
 * 1. Execute deno lint with appropriate options
 * 2. Parse and return structured lint results
 */
export function* runLint(options: LintOptions): Operation<LintResult> {
  const { packageDir, files, cacheDir } = options;
  
  yield* log.debug(`Running deno lint in ${packageDir}`);
  
  const args = ["lint"];
  
  // Add cache directory if provided
  if (cacheDir) {
    args.push("--cache-dir", cacheDir);
  }
  
  // Add files if specified, otherwise use default Deno behavior
  if (files && files.length > 0) {
    args.push(...files);
  }
  
  const command = new Deno.Command("deno", {
    args,
    cwd: packageDir,
    stdout: "piped",
    stderr: "piped",
  });
  
  const output = yield* until(command.output());
  const stdout = new TextDecoder().decode(output.stdout);
  const stderr = new TextDecoder().decode(output.stderr);
  
  yield* log.debug(`Deno lint completed with exit code ${output.code}`);
  
  // Parse Deno lint output
  return parseDenoLintOutput(stdout, stderr, output.code);
}

function parseDenoLintOutput(stdout: string, stderr: string, exitCode: number): LintResult {
  const issues: LintIssue[] = [];
  let errors = 0;
  let warnings = 0;
  
  // Remove ANSI color codes for parsing
  const cleanStderr = stderr.replace(/\x1b\[[0-9;]*m/g, '');
  
  // Deno lint outputs to stderr, not stdout
  // Format: error[rule-name]: message
  //         --> filename:line:column
  const lines = cleanStderr.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for error/warning lines with rule names
    const errorMatch = line.match(/^(error|warning)\[([^\]]+)\]:\s*(.+)$/);
    if (errorMatch) {
      const [, severity, rule, message] = errorMatch;
      
      // Look for the next line with file location
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
      const locationMatch = nextLine.match(/-->\s*(.+?):(\d+):(\d+)$/);
      
      if (locationMatch) {
        const [, file, lineStr, colStr] = locationMatch;
        
        const issue: LintIssue = {
          file: file.trim(),
          line: parseInt(lineStr, 10),
          column: parseInt(colStr, 10),
          severity: severity as "error" | "warning",
          message: message.trim(),
          rule: rule.trim(),
        };
        
        issues.push(issue);
        
        if (severity === "error") {
          errors++;
        } else if (severity === "warning") {
          warnings++;
        }
      }
    }
  }
  
  // Success is exit code 0 (which means no linting errors found)
  const success = exitCode === 0;
  
  return {
    success,
    exitCode,
    stdout,
    stderr,
    issuesFound: issues.length,
    errors,
    warnings,
    issues,
  };
}