'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export function CopyButton({ text }: { readonly text: string }) {
  const [status, setStatus] = useState<'Idle' | 'Copied' | 'Failed'>('Idle');
  useEffect(() => {
    if (status === 'Idle') {
      return;
    }
    const timer = window.setTimeout(() => setStatus('Idle'), 2500);
    return () => window.clearTimeout(timer);
  }, [status]);

  const copy = () => {
    if (navigator.clipboard === undefined) {
      setStatus('Failed');
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () => setStatus('Copied'),
      () => setStatus('Failed'),
    );
  };

  return (
    <span className='flex items-center print:hidden'>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant='ghost'
              size='icon'
              className='size-10'
              onClick={copy}
              aria-label='Copy code'
            />
          }
        >
          {status === 'Copied' ? <Check aria-hidden='true' /> : <Copy aria-hidden='true' />}
        </TooltipTrigger>
        <TooltipContent>Copy code</TooltipContent>
      </Tooltip>
      <span
        className={status === 'Failed' ? 'max-w-36 font-sans text-xs leading-tight' : 'sr-only'}
        aria-live='polite'
      >
        {status === 'Copied'
          ? 'Copied to clipboard'
          : status === 'Failed'
            ? 'Select and copy the code manually.'
            : ''}
      </span>
    </span>
  );
}
