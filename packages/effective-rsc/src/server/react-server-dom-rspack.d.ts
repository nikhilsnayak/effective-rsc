declare module 'react-server-dom-rspack/client' {
  export function createFromReadableStream<T>(stream: ReadableStream<Uint8Array>): PromiseLike<T>;
}

declare module 'react-server-dom-rspack/server.node' {
  export function renderToReadableStream(
    model: unknown,
    options?: {
      readonly signal?: AbortSignal;
    },
  ): ReadableStream<Uint8Array>;
}
