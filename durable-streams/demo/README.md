# Durable Dinner Demo

A live demo of durable execution built on Effection. It runs a cooking workflow,
lets you hard-kill the process, then restart and watch it replay from the
journal without duplicating completed work.

## Prerequisites

- Node.js 22+
- `tmux` 3.x+ (`brew install tmux`)

## Quick Start (tmux launcher)

From `durable-streams/`:

```sh
./demo/start.sh
```

Or with a custom stream ID:

```sh
./demo/start.sh my-stream
```

This opens a `tmux` session named `durable-dinner` with 4 panes:

- Server (`demo/server.ts`)
- Journal tailer (`demo/tail.ts`)
- Cook workflow (`demo/cook.ts`) (focused)
- Control pane with pre-typed kill command

Press Enter in the cook pane to start.

## Demo Script

1. Start with `./demo/start.sh`
2. In the cook pane, press Enter to run:

   ```sh
   node --experimental-strip-types demo/cook.ts
   ```

3. Let it run a few steps
4. In the control pane, press Enter to hard-kill:

   ```sh
   pkill -9 -f 'demo/cook.ts'
   ```

5. Back in the cook pane, rerun:

   ```sh
   node --experimental-strip-types demo/cook.ts
   ```

You should see:

- `Found N events in journal — replaying...`
- No new tailer events during replay
- New events only after replay catches up and live execution resumes

## Run Without tmux

Open 3 terminals from `durable-streams/`:

Terminal 1 (server):

```sh
node --experimental-strip-types demo/server.ts
```

Terminal 2 (tailer):

```sh
DURABLE_STREAM_ID=my-stream node --experimental-strip-types demo/tail.ts
```

Terminal 3 (workflow):

```sh
DURABLE_STREAM_ID=my-stream node --experimental-strip-types demo/cook.ts
```

Then kill and restart Terminal 3 to observe replay behavior.

## Environment Variables

- `DURABLE_SERVER_URL` (default: `http://localhost:4437`)
- `DURABLE_STREAM_ID` (default: `dinner-demo`)
