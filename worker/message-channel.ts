import { type Operation, resource } from "effection";

export function useMessageChannel(): Operation<MessageChannel> {
  return resource(function* (provide) {
    let channel = new MessageChannel();
    try {
      yield* provide(channel);
    } finally {
      channel.port1.close();
      channel.port2.close();
    }
  });
}
