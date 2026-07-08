declare module 'atob' {
  const atob: (input: string) => string;
  export default atob;
}

declare module 'cross-blob' {
  const Blob: typeof globalThis.Blob;
  export default Blob;
}

// dotenv@8 ships types at `types/index.d.ts` but its package.json `exports`
// map exposes no `types` condition, so NodeNext resolution can't find them.
// Shim the tiny surface we use (`dotenv.config()`).
declare module 'dotenv' {
  interface DotenvConfigOutput {
    parsed?: Record<string, string>;
    error?: Error;
  }
  export function config(options?: object): DotenvConfigOutput;
  const dotenv: { config: typeof config };
  export default dotenv;
}
