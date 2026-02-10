import {
  stream,
  type Operation,
  type Stream,
  until,
  useAbortSignal,
} from "effection";

export interface FetchResponse {
  readonly raw: Response;
  readonly bodyUsed: boolean;
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly url: string;
  readonly redirected: boolean;
  readonly type: ResponseType;
  json<T = unknown>(): Operation<T>;
  json<T>(parse: (value: unknown) => T): Operation<T>;
  text(): Operation<string>;
  arrayBuffer(): Operation<ArrayBuffer>;
  blob(): Operation<Blob>;
  formData(): Operation<FormData>;
  body(): Stream<Uint8Array, void>;
  ensureOk(): Operation<this>;
  clone(): FetchResponse;
}

export class HttpError extends Error {
  readonly name = "HttpError";
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  readonly response: FetchResponse;

  constructor(
    status: number,
    statusText: string,
    url: string,
    response: FetchResponse,
  ) {
    super(`HTTP ${status}: ${statusText}`);
    Object.setPrototypeOf(this, new.target.prototype);
    this.status = status;
    this.statusText = statusText;
    this.url = url;
    this.response = response;
  }
}

export function* fetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Operation<FetchResponse> {
  let scopeSignal = yield* useAbortSignal();

  let signal = init?.signal
    ? AbortSignal.any([init.signal, scopeSignal])
    : scopeSignal;

  let response = yield* until(globalThis.fetch(input, { ...init, signal }));
  return createFetchResponse(response);
}

function createFetchResponse(response: Response): FetchResponse {
  let consumed = false;

  let guardBody = () => {
    if (consumed || response.bodyUsed) {
      throw new Error("Body has already been consumed");
    }
    consumed = true;
  };

  let self: FetchResponse = {
    get ok() {
      return response.ok;
    },
    get status() {
      return response.status;
    },
    get statusText() {
      return response.statusText;
    },
    get headers() {
      return response.headers;
    },
    get url() {
      return response.url;
    },
    get redirected() {
      return response.redirected;
    },
    get type() {
      return response.type;
    },
    get bodyUsed() {
      return consumed || response.bodyUsed;
    },
    get raw() {
      return response;
    },
    *json<T = unknown>(parse?: (value: unknown) => T): Operation<T> {
      guardBody();
      let value: unknown = yield* until(response.json());
      return parse ? parse(value) : (value as T);
    },
    *text(): Operation<string> {
      guardBody();
      return yield* until(response.text());
    },
    *arrayBuffer(): Operation<ArrayBuffer> {
      guardBody();
      return yield* until(response.arrayBuffer());
    },
    *blob(): Operation<Blob> {
      guardBody();
      return yield* until(response.blob());
    },
    *formData(): Operation<FormData> {
      guardBody();
      return yield* until(response.formData());
    },
    body(): Stream<Uint8Array, void> {
      guardBody();
      if (!response.body) {
        throw new Error("Response has no body");
      }

      return stream(
        response.body as unknown as AsyncIterable<Uint8Array, void>,
      );
    },
    *ensureOk(): Operation<FetchResponse> {
      if (!response.ok) {
        throw new HttpError(
          response.status,
          response.statusText,
          response.url,
          self,
        );
      }
      return self;
    },
    clone(): FetchResponse {
      if (consumed || response.bodyUsed) {
        throw new Error("Cannot clone after body has been consumed");
      }
      return createFetchResponse(response.clone());
    },
  };

  return self;
}
