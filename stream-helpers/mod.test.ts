import { pipe } from "npm:fp-ts@^2/function";
import { Stream } from "effection";

// function createTaskPipe<T, R>(source: Stream<T, never>) {
//   return pipe(
//     source,
//     batch({ 
//       maxSize: 50,
//       maxTime: 30_000
//     }),
//     valve({
//       closeAt: 5,
//       openAt: 2,
//       open() {
  
//       },
//       close() {
  
//       }
//     }),
//     spawner<T, R>({
//       maxConcurrency: 1,
//       enqueue: (batch) => sleep(1000)
//     })
//   )
// }
