import process from "node:process";
import { each, exit, main, scoped, spawn } from "effection";
import { z } from "zod";
import { parser } from "zod-opts";
import packageJson from "./package.json" with { type: "json" };
import { watch } from "./watch.ts";

const builtins = ["-h", "--help", "-V", "--version", "--path"];

main(function* (argv) {
  let { args, rest } = extract(argv);
  parser()
    .name("watch")
    .description(
      "run a command, and restart it every time a source file in a directory changes",
    )
    .args([
      {
        name: "command",
        type: z.array(z.string()).optional(),
      },
    ])
    .version(packageJson.version)
    .parse(args);

  if (rest.length === 0) {
    yield* exit(5, "no command specified to watch");
  }

  let command = rest.join(" ");

  let watcher = watch({
    path: process.cwd(),
    cmd: command,
  });

  for (let start of yield* each(watcher)) {
    process.stdout.write(`${command}\n`);
    yield* scoped(function* () {
      let { result } = start;
      if (result.ok) {
        let proc = result.value;
        yield* spawn(function* () {
          for (let chunk of yield* each(proc.stdout)) {
            process.stdout.write(chunk as Uint8Array);
            yield* each.next();
          }
        });
        yield* spawn(function* () {
          for (let chunk of yield* each(proc.stderr)) {
            process.stderr.write(chunk as Uint8Array);
            yield* each.next();
          }
        });
      } else {
        console.error(`failed to start: ${result.error}`);
      }
      yield* start.restarting;
      process.stdout.write("--> restarting....\n");
      yield* each.next();
    });
  }
});

interface Extract {
  args: string[];
  rest: string[];
}

function extract(argv: string[]): Extract {
  let args: string[] = [];
  let rest: string[] = argv.slice();

  for (let arg = rest.shift(); arg; arg = rest.shift()) {
    if (!arg.startsWith("-")) {
      rest.push(arg);
      break;
    }
    if (builtins.includes(arg)) {
      args.push(arg);
      if (arg === "--path") {
        const next = rest.shift();
        if (next !== undefined) {
          args.push(next);
        }
      }
    } else {
      rest.unshift(arg);
      break;
    }
  }
  return { args, rest };
}
