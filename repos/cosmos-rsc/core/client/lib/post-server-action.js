import { callServer } from './call-server.js';
import {
  createFromReadableStream,
  encodeReply,
} from 'react-server-dom-webpack/client';

export async function postServerAction(id, args) {
  const headers = new Headers();
  headers.append('server-action-id', id);
  headers.append('accept', 'text/x-component');

  const response = await fetch('', {
    method: 'POST',
    headers,
    body: await encodeReply(args),
  });

  if (!response.ok) {
    throw new Error('Failed to execute server function');
  }

  return createFromReadableStream(response.body, {
    callServer,
  });
}
