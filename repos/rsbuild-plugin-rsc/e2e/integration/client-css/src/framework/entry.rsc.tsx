import type { IncomingMessage, ServerResponse } from 'node:http';
import type React from 'react';
import {
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
  const url = new URL(request.url);
  const serverEntry = App as ServerEntry<typeof App>;
  const cssLinks = serverEntry.entryCssFiles
    ? serverEntry.entryCssFiles.map((href) => (
        <link key={href} rel="stylesheet" href={href} precedence="default" />
      ))
    : null;
  const root = (
    <>
      {cssLinks}
      <App />
    </>
  );
  const rscStream = renderToReadableStream({ root });

  if (request.headers.get('Accept')?.includes('text/x-component')) {
    return new Response(rscStream, {
      headers: {
        'content-type': 'text/x-component;charset=utf-8',
      },
    });
  }

  const ssrResult = await renderHTML(rscStream, {
    bootstrapScripts: serverEntry.entryJsFiles,
    debugNojs: url.searchParams.has('__nojs'),
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
  if (req.method === 'GET' && url.pathname === '/') {
    const fetch = toNodeHandler(handler) as NodeHandler;
    await fetch(req, res);
    return;
  }

  next();
}

export default {
  nodeHandler,
};
