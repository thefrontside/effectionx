import type { Operation } from "npm:effection@3.6.0";
import { fetchApi } from "../lib/fetch.ts";

export interface MockFetchResponse {
  url: string;
  response: Response;
}

export function* mockFetch(responses: MockFetchResponse[]): Operation<void> {
  yield* fetchApi.around({
    *fetch(args, next): Operation<Response> {
      const [url, options] = args;
      const mockResponse = responses.find(mock => mock.url === url);
      if (mockResponse) {
        return mockResponse.response;
      }
      return yield* next(url, options);
    }
  });
}

export function createMockResponse(body: unknown, options: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...options,
  });
}

export function createNpmRegistryMockResponse(versions: string[]): Response {
  const npmResponse = {
    versions: Object.fromEntries(
      versions.map(version => [version, { version }])
    ),
    "dist-tags": {
      latest: versions[versions.length - 1]
    }
  };
  
  return createMockResponse(npmResponse);
}