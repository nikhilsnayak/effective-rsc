'use server';

import { setSubmittedMessage } from './state.ts';

export async function submitMessage(formData: FormData) {
  const message = formData.get('message');
  if (typeof message !== 'string') {
    throw new TypeError('Expected message to be a string');
  }

  setSubmittedMessage(message);
}
