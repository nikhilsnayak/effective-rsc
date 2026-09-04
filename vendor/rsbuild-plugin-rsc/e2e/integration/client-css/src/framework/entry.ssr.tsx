import React from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { createFromReadableStream } from 'react-server-dom-rspack/client';
import type { RscPayload } from './entry.rsc';

export async function renderHTML(
  rscStream: ReadableStream<Uint8Array>,
  options: {
    bootstrapScripts?: string[];
    debugNojs?: boolean;
  },
): Promise<{ stream: ReadableStream<Uint8Array>; status?: number }> {
  let payload: Promise<RscPayload>;
  function SsrRoot() {
    payload ??= createFromReadableStream<RscPayload>(rscStream);
    return React.use(payload).root;
  }

  const htmlStream = await renderToReadableStream(<SsrRoot />, {
    bootstrapScripts: options.debugNojs ? undefined : options.bootstrapScripts,
  });

  return { stream: htmlStream };
}
