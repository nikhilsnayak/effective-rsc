import React from 'react';
import { renderToReadableStream } from 'react-dom/server.edge';
import { prerender } from 'react-dom/static.edge';
import { createFromReadableStream } from 'react-server-dom-rspack/client.node';
import { injectRSCPayload } from 'rsc-html-stream/server';
import type { RscPayload } from './shared';

export async function renderHtml(
  rscStream: ReadableStream<Uint8Array>,
  options?: {
    bootstrapScripts?: string[];
    ssg?: boolean;
  },
): Promise<{ stream: ReadableStream<Uint8Array>; status?: number }> {
  const [rscStream1, rscStream2] = rscStream.tee();

  let payload: Promise<RscPayload>;
  function SsrRoot() {
    payload ??= createFromReadableStream<RscPayload>(rscStream1);
    const root = React.use(payload).root;
    return root;
  }
  let htmlStream: ReadableStream<Uint8Array>;
  let status: number | undefined;
  if (options?.ssg) {
    // for static site generation, let errors throw to fail the build
    const prerenderResult = await prerender(<SsrRoot />, {
      bootstrapScripts: options?.bootstrapScripts,
    });
    htmlStream = prerenderResult.prelude;
  } else {
    // for regular SSR, catch errors and fallback to CSR
    try {
      htmlStream = await renderToReadableStream(<SsrRoot />, {
        bootstrapScripts: options?.bootstrapScripts,
      });
    } catch {
      // fallback to render an empty shell and run pure CSR on browser,
      // which can replay server component error and trigger error boundary.
      status = 500;
      htmlStream = await renderToReadableStream(
        <html lang="en">
          <body>
            <noscript>Internal Server Error: SSR failed</noscript>
          </body>
        </html>,
        {
          bootstrapScripts: options?.bootstrapScripts,
        },
      );
    }
  }

  let responseStream: ReadableStream<Uint8Array> = htmlStream;
  responseStream = responseStream.pipeThrough(injectRSCPayload(rscStream2));
  return { stream: responseStream, status };
}
