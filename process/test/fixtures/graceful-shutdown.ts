import { main, sleep } from "effection";

await main(function* () {
  try {
    yield* sleep(100_000_000);
  } finally {
    console.log("done");
  }
});
