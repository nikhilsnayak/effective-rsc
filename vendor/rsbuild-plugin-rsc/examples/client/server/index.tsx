import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ReactFormState } from 'react-dom/client';
import {
  renderToReadableStream,
  type ServerEntry,
  type TemporaryReferenceSet,
} from 'react-server-dom-rspack/server.node';
import { toNodeHandler } from 'srvx/node';
import { RSC } from './RSC';

type NodeRequestHandler = (
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
) => void | Promise<void>;

export type RscPayload = {
  root: React.ReactNode;
  returnValue?: { ok: boolean; data: unknown };
  formState?: ReactFormState;
};

async function handler(): Promise<Response> {
  let temporaryReferences: TemporaryReferenceSet | undefined;
  const rscOptions = { temporaryReferences };
  const RscEntry = RSC as ServerEntry<typeof RSC>;
  const root = (
    <>
      {RscEntry.entryCssFiles
        ? RscEntry.entryCssFiles.map((href) => (
            <link
              key={href}
              rel="stylesheet"
              href={href}
              precedence="default"
            ></link>
          ))
        : null}
      <RSC />
    </>
  );
  const rscStream = renderToReadableStream(root, rscOptions);

  return new Response(rscStream, {
    headers: {
      'content-type': 'text/x-component;charset=utf-8',
    },
  });
}

const fetch = toNodeHandler(() => handler()) as NodeRequestHandler;

async function nodeHandler(
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
  next: () => void,
) {
  if (req.headers.accept?.includes('text/x-component')) {
    await fetch(req, res);
  } else {
    next();
  }
}

export default {
  nodeHandler,
};

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept();
}
