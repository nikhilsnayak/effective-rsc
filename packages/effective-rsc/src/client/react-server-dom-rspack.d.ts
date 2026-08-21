declare module 'react-server-dom-rspack/client.browser' {
  export function createFromReadableStream<T>(stream: ReadableStream<Uint8Array>): PromiseLike<T>;
}
