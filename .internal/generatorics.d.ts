declare module "generatorics" {
  interface GeneratoricsClone {
    cartesian<T>(...arrays: T[][]): Generator<T[]>;
  }

  interface Generatorics {
    cartesian<T>(...arrays: T[][]): Generator<T[]>;
    clone: GeneratoricsClone;
  }

  const G: Generatorics;
  export default G;
}
