import type { IncomingMessage, ServerResponse } from 'node:http';
import type React from 'react';
import type { ReactFormState } from 'react-dom/client';
import {
  decodeAction,
  decodeFormState,
  renderToReadableStream,
  type ServerEntry,
} from 'react-server-dom-rspack/server.node';
import { toNodeHandler } from 'srvx/node';
import { App } from '../App.tsx';
import { renderHTML } from './entry.ssr.tsx';

type NodeHandler = (
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
) => Promise<void> | void;

export type RscPayload = {
  root: React.ReactNode;
};

async function handler(request: Request): Promise<Response> {
  let formState: ReactFormState | undefined;

  if (request.method === 'POST') {
    const formData = await request.formData();

    try {
      const action = await decodeAction(formData);
      if (!action) {
        return new Response('Server action not found', { status: 400 });
      }

      const result = await action();
      formState = (await decodeFormState(result, formData)) as ReactFormState;
    } catch (error) {
      console.error('Failed to decode or run server action:', error);
      return new Response('Server action failed', { status: 500 });
    }
  }

  const url = new URL(request.url);
  const serverEntry = App as ServerEntry<typeof App>;
  const cssLinks = serverEntry.entryCssFiles
    ? serverEntry.entryCssFiles.map((href) => (
        <link key={href} rel="stylesheet" href={href} precedence="default" />
      ))
    : null;
  const rscStream = renderToReadableStream({
    root: (
      <>
        {cssLinks}
        <App />
      </>
    ),
  });

  if (request.headers.get('Accept')?.includes('text/x-component')) {
    return new Response(rscStream, {
      headers: {
        'content-type': 'text/x-component;charset=utf-8',
      },
    });
  }

  const ssrResult = await renderHTML(rscStream, {
    // NOTE: We are not passing bootstrapScripts here because we want to simulate a scenario where the client does not have JavaScript enabled.
    // bootstrapScripts: serverEntry.entryJsFiles,
    formState,
  });

  return new Response(ssrResult.stream, {
    status: ssrResult.status,
    headers: {
      'content-type': 'text/html;charset=utf-8',
    },
  });
}

async function nodeHandler(
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
  next: () => void,
) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if ((req.method === 'GET' || req.method === 'POST') && url.pathname === '/') {
    const fetch = toNodeHandler(handler) as NodeHandler;
    await fetch(req, res);
    return;
  }

  next();
}

export default {
  nodeHandler,
};
