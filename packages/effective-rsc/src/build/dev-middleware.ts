// oxlint-disable-next-line effecttsgo/node-builtin-import -- Rsbuild exposes a Node-compatible Connect middleware boundary.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import type { RequestHandler } from '@rsbuild/core';

export type WebHandler = (request: Request) => Promise<Response>;

const toWebHeaders = (request: IncomingMessage) => {
  const headers = new Headers();

  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
    } else if (value !== undefined) {
      headers.append(name, value);
    }
  }

  return headers;
};

const toWebRequest = (request: IncomingMessage, signal: AbortSignal) => {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const init: RequestInit & { duplex?: 'half' } = {
    headers: toWebHeaders(request),
    method,
    signal,
  };

  if (method !== 'GET' && method !== 'HEAD') {
    init.body = Readable.toWeb(request) as unknown as BodyInit;
    init.duplex = 'half';
  }

  return new Request(url, init);
};

const writeWebResponse = (webResponse: Response, response: ServerResponse): Promise<void> => {
  response.statusCode = webResponse.status;
  if (webResponse.statusText.length > 0) {
    response.statusMessage = webResponse.statusText;
  }

  for (const [name, value] of webResponse.headers) {
    if (name !== 'set-cookie') {
      response.setHeader(name, value);
    }
  }

  const setCookies = webResponse.headers.getSetCookie();
  if (setCookies.length > 0) {
    response.setHeader('set-cookie', setCookies);
  }

  if (webResponse.body === null) {
    response.end();
    return Promise.resolve();
  }

  const body = Readable.fromWeb(
    webResponse.body as unknown as Parameters<typeof Readable.fromWeb>[0],
  );
  return pipeline(body, response).then(() => undefined);
};

export const makeDevMiddleware =
  (getHandler: () => WebHandler | null): RequestHandler =>
  (request, response, next) => {
    const handler = getHandler();
    if (handler === null) {
      response.statusCode = 503;
      response.end('The effective-rsc application is compiling.');
      return;
    }

    const abortController = new AbortController();
    const abortRequest = () => abortController.abort();
    const abortDisconnectedResponse = () => {
      if (!response.writableFinished) {
        abortRequest();
      }
    };
    const stopWatchingCancellation = () => {
      request.off('aborted', abortRequest);
      response.off('close', abortDisconnectedResponse);
    };

    request.once('aborted', abortRequest);
    response.once('close', abortDisconnectedResponse);

    let webRequest: Request;
    try {
      webRequest = toWebRequest(request, abortController.signal);
    } catch (cause) {
      stopWatchingCancellation();
      next(cause);
      return;
    }

    const forwardFailure = (cause: unknown) => {
      if (!abortController.signal.aborted) {
        next(cause);
      }
    };

    let handled: Promise<Response>;
    try {
      handled = handler(webRequest);
    } catch (cause) {
      stopWatchingCancellation();
      forwardFailure(cause);
      return;
    }

    void handled
      .then((webResponse) => writeWebResponse(webResponse, response))
      .catch(forwardFailure)
      .finally(stopWatchingCancellation);
  };
