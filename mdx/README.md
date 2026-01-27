# @effectionx/mdx

MDX and Markdown processing utilities for [Effection](https://frontside.com/effection) - evaluate MDX content with structured concurrency.

## Installation

```bash
npm install @effectionx/mdx
```

## Features

- **useMDX** - Low-level MDX evaluation with Effection
- **useMarkdown** - Convenience wrapper with common plugins pre-configured
- **replaceAll** - Async regex replacement helper
- **createJsDocSanitizer** - Convert JSDoc `@link` syntax to markdown links

## Usage

### Basic MDX Evaluation

The `useMDX` function evaluates MDX content. You must provide your own JSX runtime:

```typescript
import { main } from "effection";
import { useMDX } from "@effectionx/mdx";
import { jsx, jsxs, Fragment } from "react/jsx-runtime";

await main(function* () {
  const mdxModule = yield* useMDX("# Hello **World**", {
    jsx,
    jsxs,
    Fragment,
  });

  // Render the content
  const Content = mdxModule.default;
  return <Content />;
});
```

### Markdown with Common Plugins

The `useMarkdown` function includes common plugins out of the box:

- GitHub Flavored Markdown (tables, strikethrough, etc.)
- Syntax highlighting with Prism
- Heading slugs for anchor links
- Autolink headings
- JSDoc `@link` sanitization

```typescript
import { main } from "effection";
import { useMarkdown } from "@effectionx/mdx";
import { jsx, jsxs, Fragment } from "react/jsx-runtime";

await main(function* () {
  const element = yield* useMarkdown(markdownContent, {
    jsx,
    jsxs,
    Fragment,
  });

  // element is ready to render
  return element;
});
```

### Custom Link Resolution

When processing JSDoc-style documentation, you can customize how `@link` references are resolved:

```typescript
import { useMarkdown } from "@effectionx/mdx";

const element = yield* useMarkdown(docString, {
  jsx,
  jsxs,
  Fragment,
  linkResolver: function* (symbol, connector, method) {
    const name = [symbol, connector, method].filter(Boolean).join("");
    return `[${name}](/api/${symbol}${method ? `#${method}` : ""})`;
  },
});
```

### Async Regex Replacement

The `replaceAll` function allows async replacements using Effection operations:

```typescript
import { replaceAll } from "@effectionx/mdx";

const result = yield* replaceAll(
  "Hello {{name}}, welcome to {{place}}!",
  /\{\{(\w+)\}\}/g,
  function* (match) {
    const [, key] = match;
    // Could fetch from database, API, etc.
    return yield* fetchValue(key);
  },
);
```

### JSDoc Sanitization

Convert JSDoc `@link` syntax to markdown before MDX processing:

```typescript
import { createJsDocSanitizer } from "@effectionx/mdx";

const sanitize = createJsDocSanitizer();

// "{@link Context}" -> "[Context](Context)"
// "{@link Scope.run}" -> "[Scope.run](Scope.run)"
const cleaned = yield* sanitize(jsDocString);
```

## API

### useMDX(markdown, options)

Evaluate MDX content and return the resulting module.

**Options:**
- `jsx` - JSX factory function (required)
- `jsxs` - JSX factory for multiple children (required)
- `Fragment` - Fragment component (required)
- `remarkPlugins` - Additional remark plugins
- `rehypePlugins` - Additional rehype plugins
- `remarkRehypeOptions` - Options for remark-rehype

### useMarkdown(markdown, options)

Parse and evaluate markdown with common plugins pre-configured.

**Options:**
- All `useMDX` options, plus:
- `linkResolver` - Custom JSDoc link resolver
- `slugPrefix` - Prefix for heading slugs
- `showLineNumbers` - Show line numbers in code blocks (default: true)

### replaceAll(input, regex, replacement)

Asynchronously replace all regex matches in a string.

- `input` - The input string
- `regex` - The pattern to match
- `replacement` - Generator function that returns the replacement string

### createJsDocSanitizer(resolver?)

Create a function that sanitizes JSDoc `@link` syntax.

- `resolver` - Optional custom link resolver

## Included Plugins

When using `useMarkdown`, these plugins are included by default:

- [remark-gfm](https://github.com/remarkjs/remark-gfm) - GitHub Flavored Markdown
- [rehype-prism-plus](https://github.com/timlrx/rehype-prism-plus) - Syntax highlighting
- [rehype-slug](https://github.com/rehypejs/rehype-slug) - Add IDs to headings
- [rehype-autolink-headings](https://github.com/rehypejs/rehype-autolink-headings) - Add links to headings

## Requirements

- Node.js >= 22
- Effection ^3 || ^4

## License

MIT
