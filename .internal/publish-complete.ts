import { exit, main } from "effection";
import process from "node:process";

await main(function* () {
  const npmResult = process.env.NPM_RESULT || "";
  const jsrResult = process.env.JSR_RESULT || "";
  const tagResult = process.env.TAG_RESULT || "";

  console.log(`NPM: ${npmResult}`);
  console.log(`JSR: ${jsrResult}`);
  console.log(`Tag: ${tagResult}`);

  const validResults = ["success", "skipped"];

  if (!validResults.includes(npmResult)) {
    console.error("NPM publishing failed");
    yield* exit(1);
  }

  if (!validResults.includes(jsrResult)) {
    console.error("JSR publishing failed");
    yield* exit(1);
  }

  if (!validResults.includes(tagResult)) {
    console.error("Tagging failed");
    yield* exit(1);
  }

  console.log("All publish jobs completed successfully!");
});
