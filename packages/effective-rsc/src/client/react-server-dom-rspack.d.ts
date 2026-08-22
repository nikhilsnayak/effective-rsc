declare module 'react-server-dom-rspack/client.browser' {
  export type TemporaryReferenceSet = unknown;

  export function createTemporaryReferenceSet(): TemporaryReferenceSet;

  export function createFromReadableStream<T>(
    stream: ReadableStream<Uint8Array>,
    options?: { readonly temporaryReferences?: TemporaryReferenceSet },
  ): Promise<T>;

  export function encodeReply(
    value: unknown,
    options?: { readonly temporaryReferences?: TemporaryReferenceSet },
  ): Promise<BodyInit>;

  export function setServerCallback(
    callback: (id: string, args: ReadonlyArray<unknown>) => Promise<unknown>,
  ): void;
}
