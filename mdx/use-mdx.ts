import { evaluate } from "@mdx-js/mdx";
import { type Operation, call } from "effection";
import type { MDXModule } from "mdx/types";
import type { Options as RemarkRehypeOptions } from "remark-rehype";
import type { PluggableList } from "unified";

/**
 * JSX runtime functions required for MDX evaluation.
 */
export interface JSXRuntime {
  /** JSX factory function */
  jsx: (type: unknown, props: unknown, key?: string) => unknown;
  /** JSX factory for elements with multiple children */
  jsxs: (type: unknown, props: unknown, key?: string) => unknown;
  /** Fragment component */
  Fragment: unknown;
  /** Optional JSX dev factory (defaults to jsx if not provided) */
  jsxDEV?: (type: unknown, props: unknown, key?: string) => unknown;
}

/**
 * Options for MDX evaluation.
 */
export interface UseMDXOptions extends JSXRuntime {
  /**
   * List of remark plugins (optional).
   */
  remarkPlugins?: PluggableList | null | undefined;
  /**
   * List of rehype plugins (optional).
   */
  rehypePlugins?: PluggableList | null | undefined;
  /**
   * Options to pass through to `remark-rehype` (optional).
   * The option `allowDangerousHtml` will always be set to `true` and the MDX
   * nodes are passed through.
   */
  remarkRehypeOptions?: Readonly<RemarkRehypeOptions> | null | undefined;
}

/**
 * Evaluate MDX content and return the resulting module.
 *
 * This is a low-level function that requires you to provide your own JSX runtime.
 * For most use cases, consider using `useMarkdown` which provides common plugins
 * and a simpler API.
 *
 * @example
 * ```ts
 * import { useMDX } from "@effectionx/mdx";
 * import { jsx, jsxs, Fragment } from "react/jsx-runtime";
 *
 * const mdxModule = yield* useMDX("# Hello **World**", {
 *   jsx,
 *   jsxs,
 *   Fragment,
 * });
 *
 * // Render the content
 * const Content = mdxModule.default;
 * return <Content />;
 * ```
 *
 * @example
 * ```ts
 * // With remark/rehype plugins
 * import remarkGfm from "remark-gfm";
 * import rehypeSlug from "rehype-slug";
 *
 * const mdxModule = yield* useMDX(markdown, {
 *   jsx,
 *   jsxs,
 *   Fragment,
 *   remarkPlugins: [remarkGfm],
 *   rehypePlugins: [rehypeSlug],
 * });
 * ```
 */
export function* useMDX(
  markdown: string,
  options: UseMDXOptions,
): Operation<MDXModule> {
  const { jsx, jsxs, Fragment, jsxDEV, ...rest } = options;

  return yield* call(async () => {
    try {
      return await evaluate(markdown, {
        jsx,
        jsxs,
        jsxDEV: jsxDEV ?? jsx,
        Fragment,
        ...rest,
      });
    } catch (error) {
      console.error(
        `Failed to evaluate MDX content: ${markdown.slice(0, 100)}...`,
      );
      throw error;
    }
  });
}
