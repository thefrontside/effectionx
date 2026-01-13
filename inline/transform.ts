/**
 * SWC-based AST transform that converts all `yield*` expressions inside
 * generator functions into `(yield $$inline(...))` calls, applying the
 * {@link @effectionx/inline} optimization automatically.
 *
 * This module is used internally by the esbuild plugin. It is not part of the
 * public API.
 *
 * @module
 */

// @ts-types="@swc/core"
import { parseSync, printSync } from "@swc/core";
// @ts-types="@swc/core/Visitor"
import { Visitor } from "@swc/core/Visitor.js";

const DUMMY_SPAN = { start: 0, end: 0, ctxt: 0 };
const NO_INLINE_DIRECTIVE = "no inline";
const NOINLINE_JSDOC_RE = /\/\*\*[\s\S]*?@noinline\b[\s\S]*?\*\/\s*$/;

// biome-ignore lint/suspicious/noExplicitAny: untyped SWC AST node
function isNoInlineDirective(stmt: any): boolean {
  return (
    stmt?.type === "ExpressionStatement" &&
    stmt.expression?.type === "StringLiteral" &&
    stmt.expression.value === NO_INLINE_DIRECTIVE
  );
}

function hasNoInlineAnnotation(
  source: string,
  spanStart: number,
  spanEnd: number,
): boolean {
  // SWC BytePos values are global (not per-file). Convert to source index:
  // sourceIndex = bytePos - moduleSpanEnd + source.length
  let sourceIndex = spanStart - spanEnd + source.length;
  let before = source.slice(0, sourceIndex);
  return NOINLINE_JSDOC_RE.test(before);
}

function inlineIdentifier() {
  return {
    type: "Identifier" as const,
    value: "$$inline",
    optional: false,
    span: DUMMY_SPAN,
    ctxt: 0,
  };
}

function inlineCall(argument: Record<string, unknown>) {
  return {
    type: "CallExpression" as const,
    callee: inlineIdentifier(),
    arguments: [{ expression: argument }],
    span: DUMMY_SPAN,
    ctxt: 0,
    typeArguments: undefined,
  };
}

function yieldInline(argument: Record<string, unknown>) {
  return {
    type: "ParenthesisExpression" as const,
    expression: {
      type: "YieldExpression" as const,
      argument: inlineCall(argument),
      delegate: false,
      span: DUMMY_SPAN,
    },
    span: DUMMY_SPAN,
  };
}

class InlineTransformVisitor extends Visitor {
  transformed = false;
  generatorDepth = 0;
  skipFile = false;
  source: string;
  moduleSpanEnd = 0;

  constructor(source: string) {
    super();
    this.source = source;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Visitor base class types are not exported
  visitModule(n: any) {
    this.moduleSpanEnd = n.span?.end ?? 0;
    if (n.body?.length > 0 && isNoInlineDirective(n.body[0])) {
      this.skipFile = true;
      n.body.shift();
      return n;
    }
    return super.visitModule(n);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Visitor base class types are not exported
  visitScript(n: any) {
    this.moduleSpanEnd = n.span?.end ?? 0;
    if (n.body?.length > 0 && isNoInlineDirective(n.body[0])) {
      this.skipFile = true;
      n.body.shift();
      return n;
    }
    return super.visitScript(n);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Visitor base class types are not exported
  visitFunction(n: any) {
    if (n.generator) {
      if (
        hasNoInlineAnnotation(this.source, n.span?.start, this.moduleSpanEnd)
      ) {
        return super.visitFunction(n);
      }
      this.generatorDepth++;
      n = super.visitFunction(n);
      this.generatorDepth--;
      return n;
    }
    return super.visitFunction(n);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Visitor base class types are not exported
  visitYieldExpression(n: any): any {
    n = super.visitYieldExpression(n);

    if (n.delegate && n.argument && this.generatorDepth > 0) {
      this.transformed = true;
      return yieldInline(n.argument);
    }

    return n;
  }

  // Handle UsingDeclaration (await using) which the base Visitor doesn't support
  // biome-ignore lint/suspicious/noExplicitAny: Visitor base class types are not exported
  visitStatement(stmt: any): any {
    if (stmt.type === "UsingDeclaration") {
      if (stmt.declarations) {
        // biome-ignore lint/suspicious/noExplicitAny: untyped SWC AST node
        stmt.declarations = stmt.declarations.map((decl: any) => {
          if (decl.init) {
            decl.init = this.visitExpression(decl.init);
          }
          return decl;
        });
      }
      return stmt;
    }
    return super.visitStatement(stmt);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Visitor base class types are not exported
  visitTsType(n: any) {
    return n;
  }
}

/**
 * Transform source code, converting all `yield*` expressions inside generator
 * functions into `(yield $$inline(...))` calls.
 *
 * @param source - the source code to transform
 * @param filename - optional filename used to determine parser syntax (ts vs js)
 * @returns `{ code, transformed }` where `transformed` is true if any changes were made
 */
export function transformSource(
  source: string,
  filename = "input.ts",
): { code: string; transformed: boolean } {
  let isTs = /\.(?:[cm]?ts|tsx)$/.test(filename);

  let ast = parseSync(source, {
    syntax: isTs ? "typescript" : "ecmascript",
    target: "esnext",
  });

  let visitor = new InlineTransformVisitor(source);
  let newAst = visitor.visitProgram(ast);

  if (visitor.skipFile) {
    let { code } = printSync(newAst, {
      jsc: { target: "esnext" },
    });
    return { code, transformed: false };
  }

  if (!visitor.transformed) {
    return { code: source, transformed: false };
  }

  let { code } = printSync(newAst, {
    jsc: { target: "esnext" },
  });

  let importLine = `import { inline as $$inline } from "@effectionx/inline";\n`;

  return { code: importLine + code, transformed: true };
}
