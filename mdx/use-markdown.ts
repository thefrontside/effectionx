import { type Operation, call } from "effection";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePrismPlus from "rehype-prism-plus";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import type { Options as RemarkRehypeOptions } from "remark-rehype";
import type { PluggableList } from "unified";

import {
  type LinkResolver,
  createJsDocSanitizer,
  defaultLinkResolver,
} from "./jsdoc-sanitizer.ts";
import { type JSXRuntime, useMDX } from "./use-mdx.ts";

/**
 * Options for useMarkdown.
 */
export interface UseMarkdownOptions extends JSXRuntime {
  /**
   * Custom link resolver for JSDoc `@link` references.
   * Defaults to creating simple markdown links like `[Symbol](Symbol)`.
   */
  linkResolver?: LinkResolver;

  /**
   * Prefix for heading slugs (optional).
   * Useful when rendering multiple markdown sections on the same page.
   */
  slugPrefix?: string;

  /**
   * Show line numbers in code blocks (default: true).
   */
  showLineNumbers?: boolean;

  /**
   * Additional remark plugins to apply after the default plugins.
   */
  remarkPlugins?: PluggableList | null | undefined;

  /**
   * Additional rehype plugins to apply after the default plugins.
   */
  rehypePlugins?: PluggableList | null | undefined;

  /**
   * Options to pass through to `remark-rehype`.
   */
  remarkRehypeOptions?: Readonly<RemarkRehypeOptions> | null | undefined;
}

/**
 * Parse and evaluate markdown content with common plugins pre-configured.
 *
 * This is a convenience wrapper around `useMDX` that includes:
 * - GitHub Flavored Markdown (tables, strikethrough, etc.)
 * - Syntax highlighting with Prism
 * - Heading slugs for anchor links
 * - Autolink headings
 * - JSDoc `@link` sanitization
 *
 * @example
 * ```ts
 * import { useMarkdown } from "@effectionx/mdx";
 * import { jsx, jsxs, Fragment } from "react/jsx-runtime";
 *
 * const element = yield* useMarkdown("# Hello **World**", {
 *   jsx,
 *   jsxs,
 *   Fragment,
 * });
 *
 * // element is ready to render
 * return element;
 * ```
 *
 * @example
 * ```ts
 * // With custom link resolver for API docs
 * const element = yield* useMarkdown(docString, {
 *   jsx,
 *   jsxs,
 *   Fragment,
 *   linkResolver: function* (symbol, connector, method) {
 *     const name = [symbol, connector, method].filter(Boolean).join("");
 *     return `[${name}](/api/${symbol})`;
 *   },
 * });
 * ```
 */
export function* useMarkdown(
  markdown: string,
  options: UseMarkdownOptions,
): Operation<unknown> {
  const {
    jsx,
    jsxs,
    Fragment,
    jsxDEV,
    linkResolver = defaultLinkResolver,
    slugPrefix,
    showLineNumbers = true,
    remarkPlugins = [],
    rehypePlugins = [],
    remarkRehypeOptions,
  } = options;

  // Sanitize JSDoc links before MDX processing
  const sanitize = createJsDocSanitizer(linkResolver);
  const sanitized = yield* sanitize(markdown);

  // Evaluate with MDX and common plugins
  const mod = yield* useMDX(sanitized, {
    jsx,
    jsxs,
    Fragment,
    jsxDEV,
    remarkPlugins: [remarkGfm, ...(remarkPlugins ?? [])],
    rehypePlugins: [
      [rehypePrismPlus, { showLineNumbers }],
      [
        rehypeSlug,
        {
          prefix: slugPrefix ? `${slugPrefix}-` : undefined,
        },
      ],
      [
        rehypeAutolinkHeadings,
        {
          behavior: "append",
        },
      ],
      ...(rehypePlugins ?? []),
    ],
    remarkRehypeOptions,
  });

  // Execute the default export to get the rendered element
  return yield* call(async () => {
    try {
      return await mod.default();
    } catch (error) {
      console.error(
        `Failed to render markdown: ${markdown.slice(0, 100)}...`,
        error,
      );
      throw error;
    }
  });
}
