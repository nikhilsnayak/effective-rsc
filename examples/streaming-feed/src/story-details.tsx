'use client';

import { useAtomSet } from '@effect/atom-react';
import { ServerFn } from 'effective-rsc/client';
import type { ReactNode } from 'react';
import { Component, startTransition, Suspense, useState, ViewTransition } from 'react';

import { getStoryNote } from './server-functions';

// Each card needs its own atom so retrying one note doesn't interrupt another note's query.
const makeStoryNoteAtom = () => ServerFn.queryAtom(getStoryNote);

class NoteErrorBoundary extends Component<
  { readonly children: ReactNode; readonly retry: () => void },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? (
      <p className='story-note-error'>
        This note couldn’t be loaded.{' '}
        <button
          className='retry'
          type='button'
          onClick={() => {
            this.props.retry();
            this.setState({ failed: false });
          }}
        >
          Retry note
        </button>
      </p>
    ) : (
      this.props.children
    );
  }
}

export function StoryDetails({
  id,
  children,
}: {
  readonly id: number;
  readonly children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [noteAtom] = useState(makeStoryNoteAtom);
  const retry = useAtomSet(noteAtom, { mode: 'promise' });
  const [result, setResult] = useState(children);
  return (
    <div className='story-details'>
      <button
        type='button'
        aria-expanded={expanded}
        onClick={() => startTransition(() => setExpanded((value) => !value))}
      >
        {expanded ? 'Close note' : 'Read the note'}{' '}
        <span aria-hidden='true'>{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <ViewTransition default='none' enter='note' exit='note'>
          <div className='story-detail-body'>
            <NoteErrorBoundary retry={() => setResult(retry([{ id }]))}>
              <Suspense
                fallback={
                  <ViewTransition default='none' enter='note' exit='note'>
                    <p className='story-note-loading'>Loading the note…</p>
                  </ViewTransition>
                }
              >
                <ViewTransition default='none' enter='note' exit='note'>
                  {result}
                </ViewTransition>
              </Suspense>
            </NoteErrorBoundary>
          </div>
        </ViewTransition>
      )}
    </div>
  );
}
