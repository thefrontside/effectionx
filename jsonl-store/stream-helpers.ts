/**
 * A TransformStream that splits input text by newlines
 */
export class TextLineStream extends TransformStream<string, string> {
  #buffer = "";
  
  constructor() {
    super({
      transform: (chunk, controller) => {
        this.#buffer += chunk;
        const lines = this.#buffer.split("\n");
        this.#buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.length > 0) {
            controller.enqueue(line);
          }
        }
      },
      flush: (controller) => {
        if (this.#buffer.length > 0) {
          controller.enqueue(this.#buffer);
        }
      },
    });
  }
}

/**
 * A TransformStream that parses each chunk as JSON
 */
export class JsonParseStream extends TransformStream<string, unknown> {
  constructor() {
    super({
      transform: (chunk, controller) => {
        if (chunk.trim().length > 0) {
          try {
            controller.enqueue(JSON.parse(chunk));
          } catch {
            // Skip invalid JSON lines
          }
        }
      },
    });
  }
}
