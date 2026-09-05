import { Collapsible } from '@base-ui/react/collapsible';
import { Dialog } from '@base-ui/react/dialog';
import { ScrollArea } from '@base-ui/react/scroll-area';
import { Effect, Queue, Ref, Stream } from 'effect';
import { createRoot, type Root } from 'react-dom/client';

import type { DevRuntimeFailure } from './runtime-failure';

import PanelStyles from './panel.css?raw';

export type { DevRuntimeFailure } from './runtime-failure';

export const DevPanelElementName = 'ersc-dev-panel';

type DevPanelContent =
  | { readonly _tag: 'Warning'; readonly message: string }
  | { readonly _tag: 'BuildFailed'; readonly diagnostics: string }
  | { readonly _tag: 'RuntimeFailed'; readonly failures: ReadonlyArray<DevRuntimeFailure> };

export type DevPanelState =
  | { readonly _tag: 'Inactive' }
  | { readonly _tag: 'Visible'; readonly content: DevPanelContent }
  | { readonly _tag: 'Dismissed'; readonly content: DevPanelContent };

export type DevPanelEvent =
  | { readonly _tag: 'Warning'; readonly message: string }
  | { readonly _tag: 'BuildFailed'; readonly diagnostics: string }
  | { readonly _tag: 'RuntimeFailed'; readonly failure: DevRuntimeFailure }
  | { readonly _tag: 'RenderFailed'; readonly failure: DevRuntimeFailure }
  | { readonly _tag: 'BuildSucceeded' }
  | { readonly _tag: 'RuntimeReconciled' }
  | { readonly _tag: 'Opened' }
  | { readonly _tag: 'Dismissed' };

export const InitialDevPanelState: DevPanelState = { _tag: 'Inactive' };

const MaxRuntimeFailures = 5;

const sameRuntimeFailure = (left: DevRuntimeFailure, right: DevRuntimeFailure) =>
  left.name === right.name && left.message === right.message && left.stack === right.stack;

const appendRuntimeFailure = (
  failures: ReadonlyArray<DevRuntimeFailure>,
  failure: DevRuntimeFailure,
) => {
  if (failures.some((current) => sameRuntimeFailure(current, failure))) {
    return failures;
  }

  return [...failures.slice(1 - MaxRuntimeFailures), failure];
};

export const applyDevPanelEvent = (state: DevPanelState, event: DevPanelEvent): DevPanelState => {
  switch (event._tag) {
    case 'Warning':
      return state._tag === 'Inactive' ? { _tag: 'Visible', content: event } : state;
    case 'RenderFailed':
      if (state._tag !== 'Inactive' && state.content._tag === 'BuildFailed') {
        return state;
      }
      return {
        _tag: 'Visible',
        content: { _tag: 'RuntimeFailed', failures: [event.failure] },
      };
    case 'BuildFailed':
      return {
        _tag: 'Visible',
        content: { _tag: 'BuildFailed', diagnostics: event.diagnostics },
      };
    case 'RuntimeFailed': {
      switch (state._tag) {
        case 'Inactive':
          return {
            _tag: 'Visible',
            content: {
              _tag: 'RuntimeFailed',
              failures: [event.failure],
            },
          };
        case 'Visible':
        case 'Dismissed':
          switch (state.content._tag) {
            case 'BuildFailed':
              return { _tag: 'Visible', content: state.content };
            case 'RuntimeFailed':
              return {
                _tag: 'Visible',
                content: {
                  _tag: 'RuntimeFailed',
                  failures: appendRuntimeFailure(state.content.failures, event.failure),
                },
              };
            case 'Warning':
              return {
                _tag: 'Visible',
                content: { _tag: 'RuntimeFailed', failures: [event.failure] },
              };
          }
      }
    }
    case 'BuildSucceeded':
      return state._tag !== 'Inactive' && state.content._tag === 'BuildFailed'
        ? InitialDevPanelState
        : state;
    case 'RuntimeReconciled':
      return state._tag !== 'Inactive' && state.content._tag === 'RuntimeFailed'
        ? InitialDevPanelState
        : state;
    case 'Opened':
      return state._tag === 'Dismissed' ? { _tag: 'Visible', content: state.content } : state;
    case 'Dismissed':
      return state._tag === 'Visible' ? { _tag: 'Dismissed', content: state.content } : state;
  }
};

function ErrorMark() {
  return (
    <span aria-hidden='true' className='error-mark'>
      <svg fill='none' viewBox='0 0 18 18'>
        <path d='M9 5.25v4.5' stroke='currentColor' strokeLinecap='round' strokeWidth='1.5' />
        <circle cx='9' cy='12.75' fill='currentColor' r='.75' />
        <path
          d='M7.27 2.76 1.64 12.5A2 2 0 0 0 3.37 15.5h11.26a2 2 0 0 0 1.73-3L10.73 2.76a2 2 0 0 0-3.46 0Z'
          stroke='currentColor'
          strokeWidth='1.5'
        />
      </svg>
    </span>
  );
}

function RuntimeFailure({
  failure,
  index,
}: {
  readonly failure: DevRuntimeFailure;
  readonly index: number;
}) {
  return (
    <article className='failure'>
      <div aria-hidden='true' className='failure-index'>
        {String(index + 1).padStart(2, '0')}
      </div>
      <div className='failure-body'>
        <h2 className='category'>
          <span className='status-dot' />
          {failure._tag === 'UnhandledRejection' ? 'Unhandled rejection' : 'Runtime error'}
        </h2>
        <p className='message'>
          <span className='error-name'>{failure.name}:</span> {failure.message}
        </p>
        {failure.componentStack === undefined ? null : (
          <section className='trace-section'>
            <h3 className='component-stack-title'>React component stack</h3>
            <pre className='code-frame'>{failure.componentStack}</pre>
          </section>
        )}
        {failure.stack === undefined ? null : (
          <Collapsible.Root className='stack'>
            <Collapsible.Trigger className='stack-trigger'>
              <svg aria-hidden='true' fill='none' viewBox='0 0 16 16'>
                <path d='m5.75 3.5 4.5 4.5-4.5 4.5' stroke='currentColor' strokeWidth='1.5' />
              </svg>
              Stack trace
            </Collapsible.Trigger>
            <Collapsible.Panel className='stack-panel'>
              <pre className='code-frame'>{failure.stack}</pre>
            </Collapsible.Panel>
          </Collapsible.Root>
        )}
      </div>
    </article>
  );
}

type DevPanelProps = {
  readonly onOpenChange: (open: boolean) => void;
  readonly portalContainer: ShadowRoot;
  readonly state: DevPanelState;
};

function DevPanelContent({ state }: { readonly state: DevPanelState }) {
  if (state._tag === 'Inactive' || state.content._tag === 'Warning') {
    return null;
  }

  const isBuildFailure = state.content._tag === 'BuildFailed';
  const failureCount = isBuildFailure ? 1 : state.content.failures.length;

  return (
    <>
      <header>
        <ErrorMark />
        <div className='heading'>
          <span className='brand'>
            effective-rsc <span>/ development</span>
          </span>
          <Dialog.Title className='title'>
            {isBuildFailure ? 'Build failed' : 'Runtime failures'}
          </Dialog.Title>
        </div>
        <span className='failure-count'>
          {failureCount} {failureCount === 1 ? 'issue' : 'issues'}
        </span>
        <Dialog.Close aria-label='Close development panel' className='close'>
          <svg aria-hidden='true' fill='none' viewBox='0 0 18 18'>
            <path d='m4.5 4.5 9 9m0-9-9 9' stroke='currentColor' strokeWidth='1.5' />
          </svg>
        </Dialog.Close>
      </header>
      <ScrollArea.Root className='content'>
        <ScrollArea.Viewport className='content-viewport'>
          <ScrollArea.Content aria-live='assertive'>
            {isBuildFailure ? (
              <section className='build-failure'>
                <div className='section-heading'>
                  <span>Build diagnostics</span>
                  <span>Fix the error and save to retry</span>
                </div>
                <pre className='build-output'>{state.content.diagnostics}</pre>
              </section>
            ) : (
              state.content.failures.map((failure, index) => (
                <RuntimeFailure
                  failure={failure}
                  index={index}
                  key={`${failure.name}\n${failure.message}\n${failure.stack ?? ''}`}
                />
              ))
            )}
          </ScrollArea.Content>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar className='scrollbar'>
          <ScrollArea.Thumb className='scrollbar-thumb' />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </>
  );
}

function DevPanel({ onOpenChange, portalContainer, state }: DevPanelProps) {
  if (state._tag !== 'Inactive' && state.content._tag === 'Warning') {
    return state._tag === 'Dismissed' ? null : (
      <>
        <style>{PanelStyles}</style>
        <aside aria-label='Development warning' aria-live='polite' className='warning-notice'>
          <div>
            <span className='brand'>effective-rsc / development</span>
            <h2 className='title'>Client navigation unavailable</h2>
            <p>{state.content.message}</p>
          </div>
          <button
            aria-label='Dismiss development warning'
            className='close'
            onClick={() => onOpenChange(false)}
            type='button'
          >
            ×
          </button>
        </aside>
      </>
    );
  }

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={state._tag === 'Visible'}>
      <Dialog.Portal container={portalContainer}>
        <style>{PanelStyles}</style>
        <Dialog.Backdrop className='backdrop' />
        <Dialog.Viewport className='viewport'>
          <Dialog.Popup className='popup'>
            <Dialog.Description className='sr-only'>
              Development diagnostics from effective-rsc.
            </Dialog.Description>
            <DevPanelContent state={state} />
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type MountedDevPanel = {
  readonly host: HTMLElement;
  readonly portalContainer: ShadowRoot;
  readonly root: Root;
};

const mountDevPanel = Effect.acquireRelease(
  Effect.sync((): MountedDevPanel => {
    const host = document.createElement(DevPanelElementName);
    const portalContainer = host.attachShadow({ mode: 'open' });
    const mount = document.createElement('div');
    const root = createRoot(mount);
    host.style.setProperty('all', 'initial', 'important');
    portalContainer.append(mount);
    document.documentElement.append(host);

    return { host, portalContainer, root };
  }),
  ({ host, root }) =>
    Effect.sync(() => {
      root.unmount();
      host.remove();
    }),
);

export const makeDevPanel = Effect.gen(function* () {
  const panel = yield* mountDevPanel;
  const events = yield* Effect.acquireRelease(Queue.unbounded<DevPanelEvent>(), (queue) =>
    Queue.shutdown(queue).pipe(Effect.asVoid),
  );
  const state = yield* Ref.make<DevPanelState>(InitialDevPanelState);
  const onOpenChange = (open: boolean) => {
    const event: DevPanelEvent = open ? { _tag: 'Opened' } : { _tag: 'Dismissed' };
    Queue.offerUnsafe(events, event);
  };
  const processEvent = (event: DevPanelEvent) =>
    Ref.updateAndGet(state, (current) => applyDevPanelEvent(current, event)).pipe(
      Effect.tap((current) =>
        Effect.sync(() =>
          panel.root.render(
            <DevPanel
              onOpenChange={onOpenChange}
              portalContainer={panel.portalContainer}
              state={current}
            />,
          ),
        ),
      ),
    );

  yield* Stream.fromQueue(events).pipe(Stream.runForEach(processEvent), Effect.forkScoped);

  return {
    dispatch: (event: DevPanelEvent) => Queue.offer(events, event).pipe(Effect.asVoid),
  };
});
