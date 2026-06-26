import { call, main } from "effection";
import { promises as fsp } from "node:fs";
import process from "node:process";
import { x } from "@effectionx/tinyexec";

await main(function* () {
  const npmMatrixStr = process.env.NPM_MATRIX || '{"include":[]}';
  const jsrMatrixStr = process.env.JSR_MATRIX || '{"include":[]}';
  const npmMatrix = JSON.parse(npmMatrixStr);
  const jsrMatrix = JSON.parse(jsrMatrixStr);

  const publishItems = [...npmMatrix.include, ...jsrMatrix.include];

  const candidateTags = publishItems
    .filter((item: { workspace: string }) => item.workspace !== "nothing")
    .flatMap(
      (
        item: { tagname: string },
        index: number,
        array: { tagname: string }[],
      ) => {
        // Only include if this is the first occurrence of this tagname
        const firstIndex = array.findIndex((i) => i.tagname === item.tagname);
        return firstIndex === index ? [item] : [];
      },
    );
  const uniqueTags = [];

  for (const item of candidateTags) {
    const git = yield* x("git", ["tag", "--list", item.tagname]);
    const { stdout } = yield* git;

    if (stdout.trim() === "") {
      uniqueTags.push(item);
    }
  }

  const tagsExist = uniqueTags.length > 0;
  const tagsMatrix = { include: uniqueTags };

  const outputValue = [
    `tags_exist=${tagsExist}`,
    `tags_matrix=${JSON.stringify(tagsMatrix)}`,
  ].join("\n");

  console.log(outputValue);

  if (process.env.GITHUB_OUTPUT) {
    yield* call(() =>
      fsp.appendFile(process.env.GITHUB_OUTPUT as string, `${outputValue}\n`),
    );
  }
});
