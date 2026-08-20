import { renderToReadableStream as renderHTMLToReadableStream } from 'react-dom/server';
import { unstable_RSCStaticRouter as RSCStaticRouter } from 'react-router';
import type { unstable_RSCPayload as RSCServerPayload } from 'react-router/dom';
import { createFromReadableStream } from 'react-server-dom-rspack/client';

type PayloadPromise = Promise<RSCServerPayload> & {
  _deepestRenderedBoundaryId?: string | null;
  formState: Promise<unknown>;
};

const encoder = new TextEncoder();
const htmlTrailer = '</body></html>';

function isReactServerRequest(url: URL) {
  return url.pathname.endsWith('.rsc');
}

function isManifestRequest(url: URL) {
  return url.pathname.endsWith('.manifest');
}

function escapeScript(script: string) {
  return script.replace(/<!--/g, '<\\!--').replace(/<\/script/g, '<\\/script');
}

function writeChunk(
  chunk: string,
  controller: TransformStreamDefaultController<Uint8Array>,
) {
  controller.enqueue(
    encoder.encode(
      `<script>${escapeScript(`(self.__FLIGHT_DATA||=[]).push(${chunk})`)}</script>`,
    ),
  );
}

async function writeRSCStream(
  rscStream: ReadableStream<Uint8Array>,
  controller: TransformStreamDefaultController<Uint8Array>,
) {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const reader = rscStream.getReader();

  try {
    while (true) {
      const read = await reader.read();
      if (read.done) {
        break;
      }

      const chunk = read.value;

      try {
        writeChunk(
          JSON.stringify(decoder.decode(chunk, { stream: true })),
          controller,
        );
      } catch {
        const base64 = JSON.stringify(Buffer.from(chunk).toString('base64'));
        writeChunk(
          `Uint8Array.from(Buffer.from(${base64}, "base64"))`,
          controller,
        );
      }
    }
  } finally {
    reader.releaseLock();
  }

  const remaining = decoder.decode();
  if (remaining.length > 0) {
    writeChunk(JSON.stringify(remaining), controller);
  }
}

function injectRSCPayload(rscStream: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  let startedRSC = false;
  let buffered: Uint8Array[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let resolveFlightData: (() => void) | undefined;
  const flightData = new Promise<void>((resolve) => {
    resolveFlightData = resolve;
  });

  const flushBuffered = (
    controller: TransformStreamDefaultController<Uint8Array>,
  ) => {
    for (const chunk of buffered) {
      let html = decoder.decode(chunk, { stream: true });
      if (html.endsWith(htmlTrailer)) {
        html = html.slice(0, -htmlTrailer.length);
      }
      controller.enqueue(encoder.encode(html));
    }
    buffered = [];
    flushTimer = null;
  };

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffered.push(chunk);
      if (flushTimer) {
        return;
      }

      flushTimer = setTimeout(() => {
        flushBuffered(controller);
        if (!startedRSC) {
          startedRSC = true;
          writeRSCStream(rscStream, controller)
            .finally(() => resolveFlightData?.())
            .catch((error) => controller.error(error));
        }
      }, 0);
    },
    async flush(controller) {
      await flightData;
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushBuffered(controller);
      }
      controller.enqueue(encoder.encode(htmlTrailer));
    },
  });
}

export async function generateHTML(
  request: Request,
  serverResponse: Response,
  options: {
    bootstrapScripts?: string[];
  } = {},
): Promise<Response> {
  const url = new URL(request.url);
  const respondWithRSCPayload =
    isReactServerRequest(url) ||
    isManifestRequest(url) ||
    request.headers.has('rsc-action-id');

  if (
    respondWithRSCPayload ||
    serverResponse.headers.get('React-Router-Resource') === 'true'
  ) {
    return serverResponse;
  }

  if (!serverResponse.body) {
    throw new Error('Missing body in server response');
  }

  const [rscStreamForSSR, rscStreamForHydration] = serverResponse.body.tee();
  let deepestRenderedBoundaryId: string | null = null;
  let payloadPromise: Promise<RSCServerPayload> | undefined;

  const getPayload = () => {
    payloadPromise ??= Promise.resolve(
      createFromReadableStream<RSCServerPayload>(rscStreamForSSR),
    );

    const decorated = payloadPromise as PayloadPromise;
    decorated.formState ??= payloadPromise.then((payload) =>
      payload.type === 'render' ? payload.formState : undefined,
    );

    Object.defineProperties(decorated, {
      _deepestRenderedBoundaryId: {
        configurable: true,
        get() {
          return deepestRenderedBoundaryId;
        },
        set(boundaryId: string | null) {
          deepestRenderedBoundaryId = boundaryId;
        },
      },
    });

    return decorated;
  };

  const htmlStream = await renderHTMLToReadableStream(
    <RSCStaticRouter getPayload={getPayload} />,
    {
      bootstrapScripts: options.bootstrapScripts,
    },
  );

  const headers = new Headers(serverResponse.headers);
  headers.set('Content-Type', 'text/html; charset=utf-8');

  return new Response(
    htmlStream.pipeThrough(injectRSCPayload(rscStreamForHydration)),
    {
      status: serverResponse.status,
      statusText: serverResponse.statusText,
      headers,
    },
  );
}
