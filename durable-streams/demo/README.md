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

This opens a `tmux` session named `durable-dinner` with 3 panes:

```
┌─────────────────────┬──────────────────┐
│  Observer            │                  │
│  (server + journal)  │  Cook (focused)  │
├─────────────────────┤                  │
│  Control (kill cmd)  │                  │
└─────────────────────┴──────────────────┘
```

- **Observer** (`demo/observe.ts`) — starts the server and tails the journal
  via SSE, printing color-coded events as they arrive
- **Cook** (`demo/cook.ts`) — the durable cooking workflow (focused, press Enter)
- **Control** — pre-typed kill command to simulate a crash

## Demo Script

1. Start with `./demo/start.sh`
2. In the cook pane, press Enter to run the workflow
3. Watch color-coded journal events stream in the observer pane
4. In the control pane, press Enter to hard-kill the cook process
5. Back in the cook pane, rerun:

   ```sh
   node --experimental-strip-types demo/cook.ts
   ```

You should see:

- `Found N events in journal — replaying...`
- No new observer events during replay
- New events only after replay catches up and live execution resumes

## Run Without tmux

Open 2 terminals from `durable-streams/`:

Terminal 1 (observer — server + tailer):

```sh
DURABLE_STREAM_ID=my-stream node --experimental-strip-types demo/observe.ts
```

Terminal 2 (workflow):

```sh
DURABLE_STREAM_ID=my-stream node --experimental-strip-types demo/cook.ts
```

Then kill and restart Terminal 2 to observe replay behavior.

## Environment Variables

- `DURABLE_STREAM_ID` (default: `dinner-demo`)
