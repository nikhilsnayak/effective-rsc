type RscTemporaryReferenceSet = unknown;
type RscServerAction = (...args: unknown[]) => unknown;

type RscOptions = {
  onError?: (error: unknown) => string | undefined;
  temporaryReferences?: RscTemporaryReferenceSet;
};

type RscClientOptions = {
  temporaryReferences?: RscTemporaryReferenceSet;
};

declare module 'react-server-dom-rspack/client.browser' {
  export function createFromFetch<T>(
    promiseForResponse: Promise<Response> | Response,
    options?: RscClientOptions,
  ): Promise<T>;

  export function createFromReadableStream<T>(
    stream: ReadableStream<Uint8Array>,
    options?: RscClientOptions,
  ): Promise<T>;

  export function createServerReference<
    T extends (...args: never[]) => unknown,
  >(id: string, exportName?: string): T;

  export function createTemporaryReferenceSet(): RscTemporaryReferenceSet;

  export function encodeReply(
    value: unknown,
    options?: RscClientOptions,
  ): Promise<BodyInit>;

  export function registerServerReference<T extends Function>(
    reference: T,
    id: string,
    exportName?: string,
  ): T;

  export function setFindSourceMapURLCallback(
    fn: (fileName: string, environmentName: string) => string | undefined,
  ): void;

  export function setServerCallback(
    fn: (id: string, args: unknown[]) => Promise<unknown>,
  ): void;
}

declare module 'react-server-dom-rspack/client.node' {
  export * from 'react-server-dom-rspack/client.browser';
}

declare module 'react-server-dom-rspack/client' {
  export * from 'react-server-dom-rspack/client.browser';
}

declare module 'react-server-dom-rspack/server.node' {
  export type TemporaryReferenceSet = RscTemporaryReferenceSet;

  export type ServerEntry<T> = T & {
    entryCssFiles?: string[];
    entryJsFiles?: string[];
  };

  export function renderToReadableStream(
    model: unknown,
    options?: RscOptions,
  ): ReadableStream<Uint8Array>;

  export function renderToPipeableStream(
    model: unknown,
    options?: RscOptions,
  ): {
    pipe<T extends import('node:stream').Writable>(destination: T): T;
    abort(reason?: unknown): void;
  };

  export function createTemporaryReferenceSet(): RscTemporaryReferenceSet;

  export function decodeReply(
    body: FormData | string,
    options?: RscClientOptions,
  ): Promise<unknown[]>;

  export function decodeAction(body: FormData): Promise<() => Promise<unknown>>;

  export function decodeFormState(
    actionResult: unknown,
    body: FormData,
  ): unknown;

  export function loadServerAction(actionId: string): RscServerAction;

  export function registerServerReference<T extends Function>(
    reference: T,
    id: string,
    exportName?: string,
  ): T;

  export function registerClientReference<T extends Function>(
    proxyImplementation: T,
    id: string,
    exportName?: string,
  ): T;

  export function createServerEntry<T>(
    value: T,
    resource?: string,
  ): ServerEntry<T>;

  export function ensureServerActions(actions: unknown[]): void;
}

declare module '*.css';

interface ImportMeta {
  hot?: __WebpackModuleApi.Hot;
}

declare namespace __WebpackModuleApi {
  interface Hot {
    on(eventName: string, callback: (...args: unknown[]) => void): void;
  }
}
