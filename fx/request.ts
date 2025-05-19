import {
  type Operation,
  until,
  useAbortSignal,
} from "npm:effection@4.0.0-alpha.8";

export function* request(
  url: string | URL | Request,
  opts?: RequestInit,
): Operation<Response> {
  const signal = yield* useAbortSignal();
  const response = yield* until(fetch(url, { signal, ...opts }));
  return response;
}

export function* json(response: Response): Operation<unknown> {
  return yield* until(response.json());
}
