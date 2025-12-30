import type { Operation, Stream, Yielded } from "effection";
import type { StandardSchemaV1 } from "@standard-schema/spec";

export interface Method<TArgs extends unknown[], TProgress, TReturn> {
  args: StandardSchemaV1<TArgs>;
  progress: StandardSchemaV1<TProgress>;
  returns: StandardSchemaV1<TReturn>;
}

export type Methods = Record<string, Method<unknown[], unknown, unknown>>;

export interface InvocationArgs<M extends Methods, N extends keyof M> {
  name: N;
  args: StandardSchemaV1.InferInput<M[N]["args"]>;
}

export type InvocationResult<M extends Methods, N extends keyof M> = Stream<
  StandardSchemaV1.InferInput<M[N]["progress"]>,
  StandardSchemaV1.InferInput<M[N]["returns"]>
>;

export interface Protocol<M extends Methods> {
  methods: M;
}

export type Implementation<M extends Methods> = () => Operation<
  {
    [N in keyof M]: (
      ...args: InvocationArgs<M, N>["args"]
    ) => InvocationResult<M, N>;
  }
>;

export type Handle<M extends Methods> = {
  protocol: Protocol<M>;
  invoke<N extends keyof M>(args: InvocationArgs<M, N>): InvocationResult<M, N>;
  methods: Yielded<ReturnType<Implementation<M>>>;
};

export interface Inspector<M extends Methods> {
  protocol: Protocol<M>;
  attach(): Operation<Handle<M>>;
}
