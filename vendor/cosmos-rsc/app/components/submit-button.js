'use client';

import { useFormStatus } from 'react-dom';

export function SubmitButton({ children, ...props }) {
  const { pending } = useFormStatus();

  return (
    <button
      type='submit'
      className='relative inline-grid place-items-center rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none'
      disabled={pending}
      {...props}
    >
      <span
        aria-hidden='true'
        className={`col-start-1 row-start-1 transition-opacity ${
          pending ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <svg
          className='h-5 w-5 animate-spin text-white'
          xmlns='http://www.w3.org/2000/svg'
          fill='none'
          viewBox='0 0 24 24'
        >
          <circle
            className='opacity-25'
            cx='12'
            cy='12'
            r='10'
            stroke='currentColor'
            strokeWidth='4'
          />
          <path
            className='opacity-75'
            fill='currentColor'
            d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
          />
        </svg>
      </span>

      <span
        className={`col-start-1 row-start-1 transition-opacity ${
          pending ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {children}
      </span>
    </button>
  );
}
