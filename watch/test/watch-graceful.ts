import { main, sleep } from "effection";

console.log("started");

await main(function* () {
  try {
    yield* sleep(100_000_000);
  } finally {
    console.log("done");
  }
});
