declare module 'react-server-dom-rspack/client' {
  export function createFromReadableStream<T>(stream: ReadableStream<Uint8Array>): PromiseLike<T>;
}

declare module 'react-server-dom-rspack/server.node' {
  import type { ReactFormState } from 'react-dom/client';

  export type TemporaryReferenceSet = unknown;

  export function createTemporaryReferenceSet(): TemporaryReferenceSet;

  export function decodeAction(body: FormData): Promise<(() => Promise<unknown>) | null>;

  export function decodeFormState(
    actionResult: unknown,
    body: FormData,
  ): Promise<ReactFormState | null>;

  export function decodeReply(
    body: FormData | string,
    options?: {
      readonly arraySizeLimit?: number;
      readonly temporaryReferences?: TemporaryReferenceSet;
    },
  ): Promise<ReadonlyArray<unknown>>;

  export function loadServerAction(actionId: string): (...args: ReadonlyArray<unknown>) => unknown;

  export function renderToReadableStream(
    model: unknown,
    options?: {
      readonly signal?: AbortSignal;
      readonly temporaryReferences?: TemporaryReferenceSet;
    },
  ): ReadableStream<Uint8Array>;
}
