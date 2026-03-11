/**
 * Pane B: "Durable Dinner" cooking workflow.
 *
 * Usage: node --experimental-strip-types demo/cook.ts
 *
 * Connects to the Durable Streams server, runs a multi-dish cooking
 * workflow using durableAll/durableRace with durableCall and durableSleep.
 *
 * Kill this process mid-cook using the control pane in demo/start.sh, then restart.
 * The journal already has all completed checkpoints — replay produces zero
 * new events, then live execution resumes seamlessly from the next step.
 */

import { randomUUID } from "node:crypto";
import { run } from "effection";
import {
  type Json,
  type Workflow,
  durableAll,
  durableCall,
  durableRace,
  durableRun,
  durableSleep,
  useHttpDurableStream,
} from "../mod.ts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SERVER_URL = process.env.DURABLE_SERVER_URL ?? "http://localhost:4437";
const STREAM_ID = process.env.DURABLE_STREAM_ID ?? "dinner-demo";

// Fresh producerId each run — avoids seq/epoch bookkeeping in the demo
const PRODUCER_ID = `cook-${randomUUID().slice(0, 8)}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fake async work — simulate the named cooking step. */
function fakeWork<T extends Json>(
  _name: string,
  value: T,
  ms = 50,
): () => Promise<T> {
  return async () => {
    // Tiny delay to simulate real async I/O
    await new Promise((r) => setTimeout(r, ms));
    return value;
  };
}

function log(emoji: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`  ${ts}  ${emoji}  ${msg}`);
}

// ---------------------------------------------------------------------------
// Dish 1: Tomato Sauce (sequential steps + timers)
// ---------------------------------------------------------------------------

function* makeSauce(): Workflow<string> {
  log("🧅", "Chopping onion...");
  yield* durableCall("chop-onion", fakeWork("chop-onion", "onion chopped"));

  log("🧅", "Sweating onions...");
  yield* durableSleep(1500);

  log("🍅", "Adding tomatoes...");
  yield* durableCall("add-tomato", fakeWork("add-tomato", "tomatoes in"));

  log("🍅", "Simmering sauce...");
  yield* durableSleep(2000);

  log("👅", "Tasting sauce...");
  const taste = yield* durableCall(
    "taste-sauce",
    fakeWork("taste-sauce", "perfetto"),
  );
  log("👅", `Sauce verdict: ${taste}`);

  return "sauce-done";
}

// ---------------------------------------------------------------------------
// Dish 2: Focaccia (race: oven timer vs periodic check)
// ---------------------------------------------------------------------------

function* bakeFocaccia(): Workflow<string> {
  log("🫒", "Mixing dough...");
  yield* durableCall("mix-dough", fakeWork("mix-dough", "dough mixed"));

  log("🫒", "Dimpling & topping...");
  yield* durableCall("dimple-top", fakeWork("dimple-top", "dimpled"));

  log("🔥", "Into the oven! Racing timer vs periodic check...");

  // Race: oven timer (8s) vs periodic peek (every 2s, done after 3 peeks)
  const winner = yield* durableRace([
    function* ovenTimer(): Workflow<string> {
      yield* durableSleep(8000);
      log("⏱️", "Oven timer went off!");
      return "timer-done";
    },
    function* periodicCheck(): Workflow<string> {
      let peeks = 0;
      while (true) {
        yield* durableSleep(2000);
        peeks++;
        const look = yield* durableCall(
          `peek-${peeks}`,
          fakeWork(`peek-${peeks}`, peeks >= 3 ? "golden" : "not-yet"),
        );
        log("👀", `Peek #${peeks}: ${look}`);
        if (look === "golden") {
          return "looks-done";
        }
      }
    },
  ]);

  log("🍞", `Focaccia done! Winner: ${winner}`);
  return "focaccia-done";
}

// ---------------------------------------------------------------------------
// Dish 3: Roasted Vegetables (short parallel branch)
// ---------------------------------------------------------------------------

function* roastVeg(): Workflow<string> {
  log("🥕", "Prepping vegetables...");
  yield* durableCall("chop-veg", fakeWork("chop-veg", "veggies chopped"));

  log("🥕", "Tossing with oil & seasoning...");
  yield* durableCall("season-veg", fakeWork("season-veg", "seasoned"));

  log("🥕", "Roasting...");
  yield* durableSleep(3000);

  log("🥕", "Vegetables roasted!");
  return "veg-done";
}

// ---------------------------------------------------------------------------
// Main: cookDinner — all three dishes in parallel
// ---------------------------------------------------------------------------

function* cookDinner(): Workflow<string> {
  log("👨‍🍳", "Starting dinner prep — 3 dishes in parallel!");

  const results = yield* durableAll([makeSauce, bakeFocaccia, roastVeg]);

  log("🍽️", `All done! Results: ${results.join(", ")}`);
  return "Dinner is served!";
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

console.log(`\n  Durable Dinner Demo`);
console.log(`  ═══════════════════`);
console.log(`  Server:     ${SERVER_URL}`);
console.log(`  Stream:     ${STREAM_ID}`);
console.log(`  Producer:   ${PRODUCER_ID}`);
console.log();

try {
  const result = await run(function* () {
    const stream = yield* useHttpDurableStream({
      baseUrl: SERVER_URL,
      streamId: STREAM_ID,
      producerId: PRODUCER_ID,
      epoch: 1,
    });

    return yield* durableRun(cookDinner, { stream });
  });

  console.log();
  console.log(`  ✅ ${result}`);
  console.log();
} catch (err) {
  const error = err instanceof Error ? err : new Error(String(err));
  console.error("\n  ❌ Workflow failed:", error.message);
  process.exit(1);
}
