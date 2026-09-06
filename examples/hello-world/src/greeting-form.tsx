'use client';

import { useActionState } from 'react';

import { greet } from './greet';

export function GreetingForm() {
  const [message, formAction, pending] = useActionState(greet, '');

  return (
    <form action={formAction}>
      <label htmlFor='name'>Name</label>
      <div className='form-row'>
        <input autoComplete='name' id='name' maxLength={80} name='name' required type='text' />
        <button disabled={pending} type='submit'>
          {pending ? 'Submitting…' : 'Submit'}
        </button>
      </div>
      <p aria-live='polite' className='response'>
        {message}
      </p>
    </form>
  );
}
