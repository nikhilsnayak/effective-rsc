import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ReactFormState } from 'react-dom/client';
import {
  renderToReadableStream,
  type TemporaryReferenceSet,
} from 'react-server-dom-rspack/server.node';
import { NodeModulesCounter } from 'rsc-client-pkg';
import { toNodeHandler } from 'srvx/node';

type NodeHandler = (
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
) => Promise<void> | void;

export type RscPayload = {
  root: React.ReactNode;
  returnValue?: { ok: boolean; data: unknown };
  formState?: ReactFormState;
};

async function handler(): Promise<Response> {
  let temporaryReferences: TemporaryReferenceSet | undefined;
  const rscOptions = { temporaryReferences };
  const root = (
    <section>
      <h2>RSC from node_modules</h2>
      <NodeModulesCounter />
    </section>
  );
  const rscStream = renderToReadableStream(root, rscOptions);

  return new Response(rscStream, {
    headers: {
      'content-type': 'text/x-component;charset=utf-8',
    },
  });
}

const fetch = toNodeHandler(() => handler()) as NodeHandler;

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
