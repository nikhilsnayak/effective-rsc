'use client';

import type { ReactNode } from 'react';
import { Component, startTransition, Suspense, useState, ViewTransition } from 'react';

class NoteErrorBoundary extends Component<{ readonly children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? (
      <p className='story-note-error'>
        This note couldn’t be loaded.{' '}
        <button className='retry' type='button' onClick={() => window.location.reload()}>
          Reload the feed
        </button>
      </p>
    ) : (
      this.props.children
    );
  }
}

export function StoryDetails({ children }: { readonly children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
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
            <NoteErrorBoundary>
              <Suspense
                fallback={
                  <ViewTransition default='none' enter='note' exit='note'>
                    <p className='story-note-loading'>Loading the note…</p>
                  </ViewTransition>
                }
              >
                <ViewTransition default='none' enter='note' exit='note'>
                  {children}
                </ViewTransition>
              </Suspense>
            </NoteErrorBoundary>
          </div>
        </ViewTransition>
      )}
    </div>
  );
}
