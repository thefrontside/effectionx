import { main, sleep, spawn, type Task } from "effection";

import "./inspector.ts";

await main(function* () {
  let tasks: Task<string>[] = [];
  for (let i = 1; i <= 10; i++) {
    let task = yield* spawn(function* () {
      let delay = Math.random() * 1000;
      yield* sleep(delay);
      return `${i} is done`;
    });
    tasks.push(task);
  }

  for (let task of tasks) {
    yield* sleep(Math.random() * 200);
    yield* task.halt();
  }
  console.log("done");
});
