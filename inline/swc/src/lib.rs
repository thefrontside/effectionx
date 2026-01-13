//! SWC Wasm plugin that transforms all `yield*` expressions inside generator
//! functions into `(yield $$inline(...))` calls, applying the
//! `@effectionx/inline` optimization automatically.
//!
//! This is the Rust/Wasm counterpart of the JS-based transform in
//! `../transform.ts`. Both produce identical output.

use swc_core::{
    common::{comments::{CommentKind, Comments}, Span, SyntaxContext, DUMMY_SP},
    ecma::{
        ast::*,
        visit::{VisitMut, VisitMutWith},
    },
    plugin::{plugin_transform, proxies::TransformPluginProgramMetadata},
};

/// The private identifier used for the imported `inline` function.
const INLINE_BINDING: &str = "$$inline";

/// The module specifier for the inline import.
const INLINE_MODULE: &str = "@effectionx/inline";

/// The directive string that disables the inline transform.
const NO_INLINE_DIRECTIVE: &str = "no inline";

/// Check if a statement is a `"no inline"` directive (a string literal expression statement).
fn is_no_inline_directive(stmt: &Stmt) -> bool {
    if let Stmt::Expr(ExprStmt { expr, .. }) = stmt {
        if let Expr::Lit(Lit::Str(s)) = &**expr {
            return &*s.value == NO_INLINE_DIRECTIVE;
        }
    }
    false
}

/// Check if a module item is a `"no inline"` directive.
fn is_no_inline_module_directive(item: &ModuleItem) -> bool {
    if let ModuleItem::Stmt(stmt) = item {
        return is_no_inline_directive(stmt);
    }
    false
}

pub struct InlineTransformVisitor {
    /// Whether we are currently inside a generator function.
    generator_depth: u32,
    /// Whether any yield* was transformed (triggers import injection).
    transformed: bool,
    /// Whether the file-level directive was found (skip entire file).
    skip_file: bool,
    /// Optional comments handle for checking `@noinline` JSDoc annotations.
    comments: Option<Box<dyn Comments>>,
}

impl InlineTransformVisitor {
    pub fn new() -> Self {
        Self {
            generator_depth: 0,
            transformed: false,
            skip_file: false,
            comments: None,
        }
    }

    pub fn with_comments(mut self, comments: impl Comments + 'static) -> Self {
        self.comments = Some(Box::new(comments));
        self
    }

    /// Check if leading comments on a span contain `@noinline`.
    fn has_noinline_annotation(&self, span: &Span) -> bool {
        if let Some(comments) = &self.comments {
            if let Some(leading) = comments.get_leading(span.lo) {
                return leading.iter().any(|c| c.kind == CommentKind::Block && c.text.contains("@noinline"));
            }
        }
        false
    }

    /// Create the `$$inline` identifier.
    fn inline_ident(&self) -> Ident {
        Ident::new_no_ctxt(INLINE_BINDING.into(), DUMMY_SP)
    }

    /// Wrap an expression in `$$inline(expr)`.
    fn inline_call(&self, arg: Box<Expr>) -> Box<Expr> {
        Box::new(Expr::Call(CallExpr {
            span: DUMMY_SP,
            ctxt: SyntaxContext::empty(),
            callee: Callee::Expr(Box::new(Expr::Ident(self.inline_ident()))),
            args: vec![ExprOrSpread {
                spread: None,
                expr: arg,
            }],
            type_args: None,
        }))
    }

    /// Build `(yield $$inline(expr))` — a parenthesized non-delegate yield
    /// wrapping an inline call.
    fn yield_inline(&self, arg: Box<Expr>) -> Expr {
        Expr::Paren(ParenExpr {
            span: DUMMY_SP,
            expr: Box::new(Expr::Yield(YieldExpr {
                span: DUMMY_SP,
                arg: Some(self.inline_call(arg)),
                delegate: false,
            })),
        })
    }

    /// Build the import declaration:
    /// `import { inline as $$inline } from "@effectionx/inline";`
    fn inline_import(&self) -> ModuleItem {
        ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
            span: DUMMY_SP,
            specifiers: vec![ImportSpecifier::Named(ImportNamedSpecifier {
                span: DUMMY_SP,
                local: self.inline_ident(),
                imported: Some(ModuleExportName::Ident(Ident::new_no_ctxt(
                    "inline".into(),
                    DUMMY_SP,
                ))),
                is_type_only: false,
            })],
            src: Box::new(Str {
                span: DUMMY_SP,
                value: INLINE_MODULE.into(),
                raw: None,
            }),
            type_only: false,
            with: None,
            phase: ImportPhase::Evaluation,
        }))
    }
}

impl VisitMut for InlineTransformVisitor {
    fn visit_mut_module(&mut self, module: &mut Module) {
        // Check for file-level "no inline" directive
        if module.body.first().is_some_and(is_no_inline_module_directive) {
            self.skip_file = true;
            module.body.remove(0);
            return;
        }

        // Visit all children first to collect transforms
        module.visit_mut_children_with(self);

        // If any yield* was transformed, prepend the import
        if self.transformed {
            module.body.insert(0, self.inline_import());
        }
    }

    fn visit_mut_script(&mut self, script: &mut Script) {
        // Check for file-level "no inline" directive
        if script.body.first().is_some_and(is_no_inline_directive) {
            self.skip_file = true;
            script.body.remove(0);
            return;
        }

        script.visit_mut_children_with(self);
    }

    fn visit_mut_function(&mut self, f: &mut Function) {
        if f.is_generator {
            if self.has_noinline_annotation(&f.span) {
                // Still visit children so nested generators get transformed
                f.visit_mut_children_with(self);
                return;
            }
            self.generator_depth += 1;
            f.visit_mut_children_with(self);
            self.generator_depth -= 1;
        } else {
            f.visit_mut_children_with(self);
        }
    }

    fn visit_mut_expr(&mut self, expr: &mut Expr) {
        // Recurse into children first
        expr.visit_mut_children_with(self);

        // Only transform yield* inside generator functions
        if self.generator_depth == 0 {
            return;
        }

        if let Expr::Yield(yield_expr) = expr {
            if yield_expr.delegate {
                if let Some(arg) = yield_expr.arg.take() {
                    self.transformed = true;
                    *expr = self.yield_inline(arg);
                }
            }
        }
    }
}

#[plugin_transform]
pub fn process_transform(
    mut program: Program,
    metadata: TransformPluginProgramMetadata,
) -> Program {
    let mut visitor = InlineTransformVisitor::new();
    if let Some(comments) = metadata.comments {
        visitor = visitor.with_comments(comments);
    }
    program.visit_mut_with(&mut visitor);
    program
}

#[cfg(test)]
mod tests {
    use super::*;
    use swc_core::ecma::transforms::testing::test_inline;
    use swc_core::ecma::visit::visit_mut_pass;

    // NOTE: The test_inline! macro applies SWC's hygiene() and fixer() passes
    // after the transform. This means:
    // 1. The import gets dropped (hygiene resolves $$inline as unresolved)
    // 2. Redundant ParenExpr wrappers get stripped by fixer
    // In real plugin usage (via @swc/core), neither pass runs — the import
    // and parens are preserved in the output. These tests verify the core
    // yield* → yield $$inline(...) rewrite is correct.

    test_inline!(
        Default::default(),
        |_| visit_mut_pass(InlineTransformVisitor::new()),
        basic_yield_star,
        r#"function* gen() { let x = yield* foo(); }"#,
        r#"function* gen() { let x = yield $$inline(foo()); }"#
    );

    test_inline!(
        Default::default(),
        |_| visit_mut_pass(InlineTransformVisitor::new()),
        plain_yield_untouched,
        r#"function* gen() { let x = yield foo(); }"#,
        r#"function* gen() { let x = yield foo(); }"#
    );

    test_inline!(
        Default::default(),
        |_| visit_mut_pass(InlineTransformVisitor::new()),
        non_generator_untouched,
        r#"function foo() { return 1; }"#,
        r#"function foo() { return 1; }"#
    );

    test_inline!(
        Default::default(),
        |_| visit_mut_pass(InlineTransformVisitor::new()),
        multiple_yield_stars,
        r#"function* gen() {
            let a = yield* foo();
            let b = yield* bar();
            return a + b;
        }"#,
        r#"function* gen() {
            let a = yield $$inline(foo());
            let b = yield $$inline(bar());
            return a + b;
        }"#
    );

    test_inline!(
        Default::default(),
        |_| visit_mut_pass(InlineTransformVisitor::new()),
        nested_generators,
        r#"function* outer() {
            yield* (function*() {
                yield* inner();
            })();
        }"#,
        r#"function* outer() {
            yield $$inline(function*() {
                yield $$inline(inner());
            }());
        }"#
    );

    test_inline!(
        Default::default(),
        |_| visit_mut_pass(InlineTransformVisitor::new()),
        yield_star_in_for_of,
        r#"function* gen() {
            for (let x of yield* each(stream)) {
                yield* each.next();
            }
        }"#,
        r#"function* gen() {
            for (let x of yield $$inline(each(stream))) {
                yield $$inline(each.next());
            }
        }"#
    );

    // "no inline" directive tests

    test_inline!(
        Default::default(),
        |_| visit_mut_pass(InlineTransformVisitor::new()),
        file_directive_skips_all,
        r#""no inline";
        function* gen() { let x = yield* foo(); }"#,
        r#"function* gen() { let x = yield* foo(); }"#
    );

    // NOTE: @noinline JSDoc annotation tests cannot be written with test_inline!
    // because the macro's run_captured() does not set COMMENTS. The JSDoc
    // annotation is tested in the JS transform tests. In production (wasm),
    // comments are provided via PluginCommentsProxy.

    // NOTE: The fixer() pass strips redundant parens from the IIFE, so
    // `(function*() {...})()` becomes `function*() {...}()` in expected output.
    test_inline!(
        Default::default(),
        |_| visit_mut_pass(InlineTransformVisitor::new()),
        file_directive_skips_nested_too,
        r#""no inline";
        function* outer() {
            yield* (function*() {
                yield* inner();
            })();
        }"#,
        r#"function* outer() {
            yield* function*() {
                yield* inner();
            }();
        }"#
    );
}
