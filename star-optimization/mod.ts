import { Ok } from "effection";
import type { Effect, Operation, Result } from "effection";

export function star<T>(operation: Operation<T>): Star<T> {
  return {
    operation,
    description: "completely consume an operation",
    enter(resolve, routine) {
      let hoist = new StarIterator(operation, routine.data.iterator);
      routine.data.iterator = hoist;
      resolve(Ok() as Result<T>);
      return (didExit) => didExit(Ok());
    },
  };
}

interface Star<T> extends Effect<T> {
  operation: Operation<T>;
}

function isStar<T>(effect: Effect<T>): effect is Star<T> {
  return !!(effect as Star<T>).operation;
}

type EffectIterator = ReturnType<Operation<unknown>[typeof Symbol.iterator]>;

class StarIterator implements EffectIterator {
  escape?: { value: unknown; stack: EffectIterator[] } = void (0);
  stack: EffectIterator[];
  current: EffectIterator;
  constructor(operation: Operation<unknown>, original: EffectIterator) {
    this.stack = [original];
    this.current = operation[Symbol.iterator]();
  }

  next(value: unknown) {
    let next = this.current.next(value);
    while (true) {
      if (next.done) {
        let top = this.stack.pop();
        if (!top) {
          top = this.escape?.stack.pop();
          if (!top) {
            return this.escape
              ? { done: true, value: this.escape.value } as const
              : next;
          } else {
            this.current = top;
            if (top.return) {
              next = top.return(this.escape!.value);
            } else {
              next = { done: true, value: this.escape!.value };
            }
          }
        } else {
          this.current = top;
          next = this.current.next(next.value);
        }
      } else {
        let effect = next.value;
        if (isStar(effect)) {
          this.stack.push(this.current);
          this.current = effect.operation[Symbol.iterator]();
          next = this.current.next(value);
        } else {
          return next;
        }
      }
    }
  }

  return(value: unknown) {
    this.escape = { value, stack: this.stack.concat(this.current) };
    this.stack = [];
    this.current = { next: () => ({ done: true, value: void 0 }) };
    return this.next(value);
  }

  throw(error: unknown): IteratorResult<Effect<unknown>, unknown> {
    this.escape = { value: error, stack: this.stack.concat(this.current) };
    this.stack = [];
    this.current = { next: () => ({ done: true, value: void 0 }) };
    return this.throw(error);
  }
}
