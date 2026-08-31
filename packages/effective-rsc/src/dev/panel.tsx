import { Dialog } from '@base-ui/react/dialog';
import { Effect, Queue, Ref, Stream } from 'effect';
import { createRoot, type Root } from 'react-dom/client';

import PanelStyles from './panel.css?raw';

export const DevPanelElementName = 'ersc-dev-panel';

export type DevRuntimeFailure = {
  readonly _tag: 'RuntimeError' | 'UnhandledRejection';
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly componentStack?: string;
};

type DevPanelContent =
  | { readonly _tag: 'BuildFailed'; readonly diagnostics: string }
  | { readonly _tag: 'RuntimeFailed'; readonly failures: ReadonlyArray<DevRuntimeFailure> };

export type DevPanelState =
  | { readonly _tag: 'Inactive' }
  | { readonly _tag: 'Visible'; readonly content: DevPanelContent }
  | { readonly _tag: 'Dismissed'; readonly content: DevPanelContent };

export type DevPanelEvent =
  | { readonly _tag: 'BuildFailed'; readonly diagnostics: string }
  | { readonly _tag: 'RuntimeFailed'; readonly failure: DevRuntimeFailure }
  | { readonly _tag: 'Reconciled' }
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
          }
      }
    }
    case 'Reconciled':
      return InitialDevPanelState;
    case 'Opened':
      return state._tag === 'Dismissed' ? { _tag: 'Visible', content: state.content } : state;
    case 'Dismissed':
      return state._tag === 'Visible' ? { _tag: 'Dismissed', content: state.content } : state;
  }
};

function RuntimeFailure({ failure }: { readonly failure: DevRuntimeFailure }) {
  return (
    <article>
      <h2 className='category'>
        {failure._tag === 'UnhandledRejection' ? 'Unhandled rejection' : 'Runtime error'}
      </h2>
      <p>
        {failure.name}: {failure.message}
      </p>
      {failure.stack === undefined ? null : <pre>{failure.stack}</pre>}
      {failure.componentStack === undefined ? null : (
        <>
          <h3 className='component-stack-title'>React component stack</h3>
          <pre>{failure.componentStack}</pre>
        </>
      )}
    </article>
  );
}

type DevPanelProps = {
  readonly onOpenChange: (open: boolean) => void;
  readonly portalContainer: ShadowRoot;
  readonly state: DevPanelState;
};

function DevPanelContent({ state }: { readonly state: DevPanelState }) {
  if (state._tag === 'Inactive') {
    return null;
  }

  return (
    <>
      <header>
        <span className='brand'>effective-rsc dev</span>
        <Dialog.Title className='title'>
          {state.content._tag === 'BuildFailed' ? 'Build failed' : 'Runtime failures'}
        </Dialog.Title>
        <Dialog.Close aria-label='Close development panel' className='close'>
          {'\u00d7'}
        </Dialog.Close>
      </header>
      <div aria-live='assertive' className='content'>
        {state.content._tag === 'BuildFailed' ? (
          <pre>{state.content.diagnostics}</pre>
        ) : (
          state.content.failures.map((failure) => (
            <RuntimeFailure
              failure={failure}
              key={`${failure.name}\n${failure.message}\n${failure.stack ?? ''}`}
            />
          ))
        )}
      </div>
    </>
  );
}

function DevPanel({ onOpenChange, portalContainer, state }: DevPanelProps) {
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
