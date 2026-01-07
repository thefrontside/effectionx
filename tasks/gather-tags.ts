import { main, until } from "effection";

await main(function* () {
  // Read matrices from environment variables
  const jsrMatrixStr = Deno.env.get("JSR_MATRIX") || '{"include":[]}';
  const npmMatrixStr = Deno.env.get("NPM_MATRIX") || '{"include":[]}';

  const jsrMatrix = JSON.parse(jsrMatrixStr);
  const npmMatrix = JSON.parse(npmMatrixStr);

  // Combine both matrices, filter out "nothing" workspace, and get unique tags
  const combined = [...jsrMatrix.include, ...npmMatrix.include];

  const uniqueTags = combined
    .filter((item) => item.workspace !== "nothing")
    .flatMap((item, index, array) => {
      // Only include if this is the first occurrence of this tagname
      const firstIndex = array.findIndex((i) => i.tagname === item.tagname);
      return firstIndex === index ? [item] : [];
    });

  const tagsExist = uniqueTags.length > 0;
  const tagsMatrix = { include: uniqueTags };

  const outputValue = [
    `tags_exist=${tagsExist}`,
    `tags_matrix=${JSON.stringify(tagsMatrix)}`,
  ].join("\n");

  console.log(outputValue);

  if (Deno.env.has("GITHUB_OUTPUT")) {
    const githubOutput = Deno.env.get("GITHUB_OUTPUT") as string;
    yield* until(
      Deno.writeTextFile(githubOutput, outputValue, {
        append: true,
      }),
    );
  }
});
