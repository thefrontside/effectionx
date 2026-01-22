import { type } from "arktype";
import { createProtocol } from "../lib/protocol.ts";

export const protocol = createProtocol({
  watchPlayerState: {
    args: type("never[]"),
    progress: type("'playing' | 'paused'"),
    returns: type("never"),
  },
  play: {
    args: type("never[]"),
    progress: type("never"),
    returns: type("undefined"),
  }
});
