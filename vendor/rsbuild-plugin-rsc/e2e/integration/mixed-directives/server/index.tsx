import type { ReactFormState } from 'react-dom/client';
import {
  renderToReadableStream,
  type TemporaryReferenceSet,
} from 'react-server-dom-rspack/server.node';
import { Counter } from './Counter';

export type RscPayload = {
  root: React.ReactNode;
  returnValue?: { ok: boolean; data: unknown };
  formState?: ReactFormState;
};

async function handler(): Promise<Response> {
  let temporaryReferences: TemporaryReferenceSet | undefined;
  const rscOptions = { temporaryReferences };
  const rscStream = renderToReadableStream(<Counter />, rscOptions);

  return new Response(rscStream, {
    headers: {
      'content-type': 'text/x-component;charset=utf-8',
    },
  });
}

export default {
  fetch: handler,
};
