import { evaluate } from "@mdx-js/mdx";
import { join, resolve } from "@std/path";
import { call, type Operation } from "effection";
import rehypeInferDescriptionMeta from "rehype-infer-description-meta";
import rehypePrismPlus from "rehype-prism-plus";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { Fragment, jsx, jsxs } from "revolution/jsx-runtime";
import { unified } from "unified";
import type { VFile } from "vfile";
import { z } from "zod";
import { PrivatePackageError } from "../errors.ts";
import { type DocNode, useDenoDoc } from "./use-deno-doc.tsx";

export interface Package {
  path: string;
  workspace: string;
  packageName: string;
  readme: string;
  exports: string | Record<string, string>;
  docs: Array<DocNode> | Record<string, Array<DocNode>>
  MDXContent: () => JSX.Element;
  MDXDescription: () => JSX.Element;
}

const DenoJson = z.object({
  name: z.string(),
  version: z.optional(z.string()),
  exports: z.union([z.record(z.string()), z.string()]),
  private: z.union([z.undefined(), z.literal(true)]),
});

export function* usePackage(workspace: string): Operation<Package> {
  const workspacePath = resolve(
    import.meta.dirname ?? "",
    `../../${workspace}`,
  );

  const config: { default: unknown } = yield* call(
    () => import(`../../${workspace}/deno.json`, { with: { type: "json" } }),
  );

  const denoJson = DenoJson.parse(config.default);

  if (denoJson.private === true) {
    throw new PrivatePackageError(workspace);
  }

  const readme = yield* call(() =>
    Deno.readTextFile(join(workspacePath, "README.md"))
  );

  let mod = yield* call(() =>
    evaluate(readme, {
      // @ts-expect-error Type 'unknown' is not assignable to type 'JSXComponent'.
      jsx,
      // @ts-expect-error Type '{ (component: JSXComponent, props: JSXComponentProps): JSXElement; (element: string, props: JSXElementProps): JSXElement; }' is not assignable to type 'Jsx'.
      jsxs,
      // @ts-expect-error Type 'unknown' is not assignable to type 'JSXComponent'.
      jsxDEV: jsx,
      Fragment,
      remarkPlugins: [remarkGfm],
      rehypePlugins: [[rehypePrismPlus, { showLineNumbers: true }]],
    })
  );

  const content = mod.default({});

  let file: VFile = yield* call(() =>
    unified()
      .use(remarkParse)
      .use(remarkRehype)
      .use(rehypeStringify)
      .use(rehypeInferDescriptionMeta, {
        inferDescriptionHast: true,
        truncateSize: 400,
      })
      .process(
        readme,
      )
  );

  let docs: Package['docs'];
  if (typeof denoJson.exports === "string") {
    docs = yield* useDenoDoc(`${new URL(join(workspacePath, denoJson.exports), 'file://')}`)
  } else {
    docs = {};
    for (const key of Object.keys(denoJson.exports)) {
      docs[key] = yield* useDenoDoc(`${new URL(join(workspacePath, denoJson.exports[key]), 'file://')}`)
    }
  }

  return {
    workspace: workspace.replace("./", ""),
    path: workspacePath,
    packageName: denoJson.name,
    exports: denoJson.exports,
    readme,
    docs,
    MDXContent: () => content,
    MDXDescription: () => (<>{file.data?.meta?.description}</>),
  };
}