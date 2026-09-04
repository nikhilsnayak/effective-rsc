import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  renderToReadableStream,
  type ServerEntry,
} from 'react-server-dom-rspack/server.node';
import { toNodeHandler } from 'srvx/node';
// Keep Page1 and Page2 before Root to cover shared CSS ownership. Page1
// reaches Shared.css through a server-entry parent chain first, then Root must
// still make its `import './Shared.css'` root-owned so it is loaded by the
// client entry instead of duplicated in server-entry CSS metadata.
import { Page1 } from './pages/Page1';
import { Page2 } from './pages/Page2';
import { Root } from './Root';

type NodeHandler = (
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
) => Promise<void> | void;

type ServerCssPage = 'page1' | 'page2';

function getActivePage(
  url: string | undefined,
  host: string | undefined,
): ServerCssPage {
  const requestUrl = new URL(url ?? '/', `http://${host ?? 'localhost'}`);
  return requestUrl.searchParams.get('page') === 'page2' ? 'page2' : 'page1';
}

async function handler(activePage: ServerCssPage): Promise<Response> {
  const page1CssFiles =
    (Page1 as ServerEntry<typeof Page1>).entryCssFiles ?? [];
  const page2CssFiles =
    (Page2 as ServerEntry<typeof Page2>).entryCssFiles ?? [];
  const activePageCssFiles =
    activePage === 'page1' ? page1CssFiles : page2CssFiles;
  const page = activePage === 'page1' ? <Page1 /> : <Page2 />;
  const cssLinks = activePageCssFiles.map((href) => (
    <link
      key={href}
      rel="stylesheet"
      href={href}
      precedence="default"
      data-testid="server-entry-css"
    />
  ));
  const rscStream = renderToReadableStream(
    <>
      {cssLinks}
      <Root activePage={activePage}>{page}</Root>
    </>,
  );

  return new Response(rscStream, {
    headers: {
      'content-type': 'text/x-component;charset=utf-8',
    },
  });
}

export default {
  fetch(request: Request) {
    const url = new URL(request.url);
    return handler(getActivePage(`${url.pathname}${url.search}`, url.host));
  },
  async nodeHandler(
    req: IncomingMessage,
    res: ServerResponse<IncomingMessage>,
    next: () => void,
  ) {
    if (req.headers.accept?.includes('text/x-component')) {
      const fetch = toNodeHandler(() =>
        handler(getActivePage(req.url, req.headers.host)),
      ) as NodeHandler;
      await fetch(req, res);
      return;
    }

    next();
  },
};
