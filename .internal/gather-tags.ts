import { call, main } from "effection";
import { promises as fsp } from "node:fs";
import process from "node:process";

await main(function* () {
  // Read matrix from environment variable (now only npm)
  const npmMatrixStr = process.env.NPM_MATRIX || '{"include":[]}';
  const npmMatrix = JSON.parse(npmMatrixStr);

  // Filter out "nothing" workspace and get unique tags
  const uniqueTags = npmMatrix.include
    .filter((item: { workspace: string }) => item.workspace !== "nothing")
    .flatMap((item: { tagname: string }, index: number, array: { tagname: string }[]) => {
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

  if (process.env.GITHUB_OUTPUT) {
    yield* call(() =>
      fsp.appendFile(process.env.GITHUB_OUTPUT as string, outputValue + "\n")
    );
  }
});
