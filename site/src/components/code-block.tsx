import { Highlight } from '@sugar-high/react/core';
import * as json from 'sugar-high/lang/json';
import * as plaintext from 'sugar-high/lang/plaintext';
import * as shell from 'sugar-high/lang/shell';
import * as typescript from 'sugar-high/lang/typescript';

import { CopyButton } from './copy-button';

export function CodeBlock({
  code,
  language,
  label,
  variant,
}: {
  readonly code: string;
  readonly language: string;
  readonly label: string;
  readonly variant: 'block' | 'command';
}) {
  const syntax = ['ts', 'tsx', 'js', 'jsx', 'typescript', 'javascript'].includes(language)
    ? typescript
    : ['sh', 'bash', 'shell'].includes(language)
      ? shell
      : ['json', 'jsonc'].includes(language)
        ? json
        : plaintext;
  return (
    <div
      data-slot='code-block'
      data-variant={variant}
      className='group/code-block not-typeset bg-muted/60 relative min-w-0 border'
    >
      <div className='text-muted-foreground flex min-h-11 items-center justify-between gap-2 border-b pr-1 pl-4 font-mono text-xs group-data-[variant=command]/code-block:absolute group-data-[variant=command]/code-block:inset-y-0 group-data-[variant=command]/code-block:right-0 group-data-[variant=command]/code-block:border-0 group-data-[variant=command]/code-block:pl-0'>
        <span className='group-data-[variant=command]/code-block:hidden'>{label}</span>
        <CopyButton text={code} />
      </div>
      <Highlight
        code={code}
        lang={syntax}
        render={({ lines }) => (
          <pre className='overflow-auto p-5 font-mono text-xs leading-relaxed [tab-size:2] group-data-[variant=command]/code-block:py-4 group-data-[variant=command]/code-block:pr-12 group-data-[variant=command]/code-block:text-sm print:[overflow-wrap:anywhere] print:whitespace-pre-wrap'>
            <code className='font-mono'>
              {lines.map((line, index) => (
                <span key={index} {...line.properties}>
                  {line.tokens.map((token, index) => (
                    <span key={index} {...token.properties}>
                      {token.value}
                    </span>
                  ))}
                  {'\n'}
                </span>
              ))}
            </code>
          </pre>
        )}
      />
    </div>
  );
}
