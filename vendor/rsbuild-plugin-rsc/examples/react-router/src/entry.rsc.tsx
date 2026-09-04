import type { IncomingMessage, ServerResponse } from 'node:http';
import { unstable_matchRSCServerRequest as matchRSCServerRequest } from 'react-router';
import {
  createTemporaryReferenceSet,
  decodeAction,
  decodeFormState,
  decodeReply,
  loadServerAction as loadServerActionSync,
  renderToReadableStream,
  type ServerEntry,
} from 'react-server-dom-rspack/server.node';
import { toNodeHandler } from 'srvx/node';
import { generateHTML } from './entry.ssr';
import { routes } from './routes/config';
import { Layout } from './routes/root/route';

type NodeRequestHandler = (
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
) => void | Promise<void>;

async function fetchServer(request: Request) {
  return matchRSCServerRequest({
    // Provide the React Server touchpoints.
    createTemporaryReferenceSet,
    decodeAction,
    decodeFormState,
    decodeReply,
    loadServerAction: (id) => Promise.resolve(loadServerActionSync(id)),
    request,
    // The app routes.
    routes: routes(),
    // Encode the match with the React Server implementation.
    generateResponse(match, options) {
      return new Response(renderToReadableStream(match.payload, options), {
        status: match.statusCode,
        headers: match.headers,
      });
    },
  });
}

async function handler(request: Request): Promise<Response> {
  const response = await fetchServer(request);
  const layoutEntry = Layout as ServerEntry<typeof Layout>;
  return generateHTML(request, response, {
    bootstrapScripts: layoutEntry.entryJsFiles,
  });
}

const handleNodeRequest = toNodeHandler((request) =>
  handler(request),
) as NodeRequestHandler;

function shouldBypassRequest(req: IncomingMessage) {
  if (!req.url) {
    return true;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return true;
  }

  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (pathname.startsWith('/__rsbuild_')) {
    return true;
  }

  if (pathname.endsWith('.rsc') || pathname.endsWith('.manifest')) {
    return false;
  }

  if (pathname !== '/' && /\.[a-z0-9]+$/i.test(pathname)) {
    return true;
  }

  return false;
}

async function nodeHandler(
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
  next: () => void,
) {
  if (shouldBypassRequest(req)) {
    next();
    return;
  }

  await handleNodeRequest(req, res);
}

export default {
  nodeHandler,
};

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept();
}
