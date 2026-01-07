import { exit, main } from "effection";

await main(function* () {
  const jsrResult = Deno.env.get("JSR_RESULT") || "";
  const npmResult = Deno.env.get("NPM_RESULT") || "";
  const tagResult = Deno.env.get("TAG_RESULT") || "";

  console.log(`JSR: ${jsrResult}`);
  console.log(`NPM: ${npmResult}`);
  console.log(`Tag: ${tagResult}`);

  const validResults = ["success", "skipped"];

  if (!validResults.includes(jsrResult)) {
    console.error("JSR publishing failed");
    yield* exit(1);
  }

  if (!validResults.includes(npmResult)) {
    console.error("NPM publishing failed");
    yield* exit(1);
  }

  if (!validResults.includes(tagResult)) {
    console.error("Tagging failed");
    yield* exit(1);
  }

  console.log("All publish jobs completed successfully!");
});
