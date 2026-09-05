/**
 * @title Rendering a stateful form
 *
 * Pass the native reference to useActionState so React also owns progressive form submission.
 */
'use client';

import { useActionState } from 'react';

import { greet } from './50_greet';

export function GreetingForm() {
  const [state, formAction, pending] = useActionState(greet, { message: '' });
  return (
    <form action={formAction}>
      <input name='name' required />
      <button disabled={pending} type='submit'>
        Greet
      </button>
      <p aria-live='polite'>{state.message}</p>
    </form>
  );
}
