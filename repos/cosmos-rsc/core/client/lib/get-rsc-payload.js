import { createFromReadableStream } from 'react-server-dom-webpack/client';
import { callServer } from './call-server.js';

export async function getRSCPayload(url) {
  const headers = new Headers();
  headers.append('accept', 'text/x-component');

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message ?? 'Failed to fetch RSC Payload');
  }

  const { tree } = await createFromReadableStream(response.body, {
    callServer,
  });

  return tree;
}
