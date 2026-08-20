import React from 'react';
import type { ReactFormState } from 'react-dom/client';
import { renderToReadableStream } from 'react-dom/server';
import { createFromReadableStream } from 'react-server-dom-rspack/client';
import type { RscPayload } from './entry.rsc';

export async function renderHTML(
  rscStream: ReadableStream<Uint8Array>,
  options: {
    bootstrapScripts?: string[];
    formState?: ReactFormState;
  },
): Promise<{ stream: ReadableStream<Uint8Array>; status?: number }> {
  let payload: Promise<RscPayload>;
  function SsrRoot() {
    payload ??= createFromReadableStream<RscPayload>(rscStream);
    return React.use(payload).root;
  }

  const htmlStream = await renderToReadableStream(<SsrRoot />, {
    bootstrapScripts: options.bootstrapScripts,
    formState: options.formState,
  });

  return { stream: htmlStream };
}
