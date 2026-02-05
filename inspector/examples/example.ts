import { main, sleep, spawn, useAttributes, type Task } from "effection";

await main(function* () {
  let tasks: Task<string>[] = [];
  for (let i = 1; i <= 10; i++) {
    let task = yield* spawn(function* () {
      yield* useAttributes({ name: "child", number: i });
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
