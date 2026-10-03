# Watch

Watch is a very simple tool that does one thing: run a command, and every time
source files change in a directory, shutdown the current invocation _gracefully_
and restart it.

```
npx @effectionx/watch npm start
```

or, under Deno:

```
deno run -A npm:@effectionx/watch npm start
```

## Graceful Shutdown

Watch will send SIGINT and SIGTERM to your command, and then wait until its
`stdout` stream is closed, indicating that it has no further output. It will not
attempt to start your command again until that has happened. This is important,
because your process might be holding onto any number of resources that have to
be safely released before exiting.

## Git aware

If you are running this command inside a git repository, it will only perform
restarts on files that are under source control, or could be candidates for
source control (not ignored).

## Use it as an Effection library

Most of the time, you will use this as an executable. If you want to build your
own watch from within a library, the `/lib` export is the same machinery the
command is built on.

```ts
import { each, main } from "effection";
import { watch } from "@effectionx/watch/lib";

await main(function* () {
  const changes = watch({
    path: "./src",
    cmd: "npm test",
  });

  for (let start of yield* each(changes)) {
    console.log(start);
    yield* each.next();
  }
});
```
