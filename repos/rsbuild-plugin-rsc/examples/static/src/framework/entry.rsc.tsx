import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  renderToReadableStream,
  type ServerEntry,
} from 'react-server-dom-rspack/server.node';
import { toNodeHandler } from 'srvx/node';
import { renderHtml } from './entry.ssr';
import { parseRenderRequest } from './request';
import type { RscPayload } from './shared';
import type { Page, PageProps } from './ssg';

type NodeRequestHandler = (
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
) => void | Promise<void>;

function getPages(): Map<string, Page> {
  const contextRequire = import.meta.webpackContext('../pages', {
    recursive: false,
    regExp: /\.tsx?$/,
  });
  return new Map(
    contextRequire.keys().map((path) => {
      const name = path.replace('./', '').replace('.tsx', '');
      const route = name.toLowerCase();
      const page: Page = {
        url: `/${route}`,
        name,
      };
      return [route, page];
    }),
  );
}

const pages = getPages();

/**
 * Get all static paths for SSG.
 */
export function getStaticPaths(): string[] {
  return Array.from(pages.keys());
}

async function getPageModule(route: string) {
  const page = pages.get(route);
  if (!page) {
    throw new Error(`Page not found: ${route}`);
  }
  const mod = await import(`../pages/${page.name}.tsx`);
  return {
    Root: mod.default as ServerEntry<React.FC<PageProps>>,
    page,
  };
}

function buildRscPayload(
  Root: ServerEntry<React.FC<PageProps>>,
  page: Page,
): { payload: RscPayload; bootstrapScripts?: string[] } {
  const cssLinks = Root.entryCssFiles
    ? Root.entryCssFiles.map((href) => (
        <link key={href} rel="stylesheet" href={href} precedence="default" />
      ))
    : null;

  const rscPayload: RscPayload = {
    root: (
      <>
        {cssLinks}
        <Root pages={Array.from(pages.values())} currentPage={page} />
      </>
    ),
  };

  return {
    payload: rscPayload,
    bootstrapScripts: Root.entryJsFiles,
  };
}

/**
 * Render a page to an HTML stream (SSG mode).
 */
export async function renderStaticPage(
  route: string,
): Promise<ReadableStream<Uint8Array>> {
  const { Root, page } = await getPageModule(route);
  const { payload, bootstrapScripts } = buildRscPayload(Root, page);
  const rscStream = renderToReadableStream(payload);
  const { stream } = await renderHtml(rscStream, {
    bootstrapScripts,
    ssg: true,
  });
  return stream;
}

/**
 * Render a page to an RSC payload stream (for client-side navigation).
 */
export async function renderStaticRsc(
  route: string,
): Promise<ReadableStream<Uint8Array>> {
  const { Root, page } = await getPageModule(route);
  const { payload } = buildRscPayload(Root, page);
  return renderToReadableStream(payload);
}

// --- Dev server handler ---

async function handler(request: Request): Promise<Response> {
  const renderRequest = parseRenderRequest(request);

  const route = renderRequest.url.pathname.substring(1)
    ? renderRequest.url.pathname.substring(1).toLowerCase()
    : 'index';

  const { Root, page } = await getPageModule(route);
  const { payload, bootstrapScripts } = buildRscPayload(Root, page);
  const rscStream = renderToReadableStream(payload);

  if (renderRequest.isRsc) {
    return new Response(rscStream, {
      headers: {
        'content-type': 'text/x-component;charset=utf-8',
      },
    });
  }

  const ssrResult = await renderHtml(rscStream, { bootstrapScripts });

  return new Response(ssrResult.stream, {
    status: ssrResult.status,
    headers: {
      'content-type': 'text/html;charset=utf-8',
    },
  });
}

const fetch = toNodeHandler(handler) as NodeRequestHandler;

async function nodeHandler(
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
  next: () => void,
) {
  try {
    await fetch(req, res);
  } catch {
    next();
  }
}

export default {
  nodeHandler,
};

if (import.meta.hot) {
  import.meta.hot.accept();
}
