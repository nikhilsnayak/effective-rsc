import { MutableRef } from 'effect';

type NavigationAttemptState =
  | { readonly _tag: 'Pending' }
  | { readonly _tag: 'Rendering' }
  | { readonly _tag: 'Failed' }
  | { readonly _tag: 'Superseded' }
  | { readonly _tag: 'Completed' }
  | { readonly _tag: 'RolledBack' };

type NavigationAttemptData = {
  readonly state: MutableRef.MutableRef<NavigationAttemptState>;
};

type NavigationCoordinatorState =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Active'; readonly attempt: NavigationAttemptData };

export type NavigationRenderResult<Render> =
  | { readonly _tag: 'Rendered'; readonly value: Render }
  | { readonly _tag: 'Discarded' };

export type NavigationRollbackReason = 'Aborted' | 'Failed';

export type NavigationAttempt = {
  readonly complete: () => void;
  readonly fail: () => void;
  readonly render: <Render>(render: () => Render) => NavigationRenderResult<Render>;
  readonly rollback: (
    reason: NavigationRollbackReason,
    rollbackRender: () => Promise<void>,
  ) => Promise<void>;
};

const navigationDispatchCompleted = () =>
  // oxlint-disable-next-line effecttsgo/new-promise -- Browser task scheduling is a native Promise boundary.
  new Promise<void>((resolve) => {
    // oxlint-disable-next-line effecttsgo/global-timers -- A task, rather than a microtask, lets the browser dispatch a superseding NavigateEvent.
    setTimeout(resolve, 0);
  });

export class BrowserNavigationCoordinator {
  private readonly state = MutableRef.make<NavigationCoordinatorState>({ _tag: 'Idle' });

  begin(): NavigationAttempt {
    const active = MutableRef.get(this.state);
    const attempt: NavigationAttemptData = {
      state: MutableRef.make<NavigationAttemptState>({ _tag: 'Pending' }),
    };
    if (active._tag === 'Active') {
      this.supersede(active.attempt);
    }
    MutableRef.set(this.state, { _tag: 'Active', attempt });
    return {
      complete: () => this.complete(attempt),
      fail: () => this.fail(attempt),
      render: (render) => this.render(attempt, render),
      rollback: (reason, rollbackRender) => this.rollback(attempt, reason, rollbackRender),
    };
  }

  private complete(attempt: NavigationAttemptData) {
    if (MutableRef.get(attempt.state)._tag !== 'Rendering') {
      return;
    }
    MutableRef.set(attempt.state, { _tag: 'Completed' });
    this.clearActive(attempt);
  }

  private fail(attempt: NavigationAttemptData) {
    const state = MutableRef.get(attempt.state);
    if (state._tag !== 'Pending') {
      return;
    }
    MutableRef.set(attempt.state, { _tag: 'Failed' });
    this.clearActive(attempt);
  }

  private render<Render>(
    attempt: NavigationAttemptData,
    render: () => Render,
  ): NavigationRenderResult<Render> {
    const state = MutableRef.get(attempt.state);
    if (state._tag !== 'Pending') {
      return { _tag: 'Discarded' };
    }
    const value = render();
    MutableRef.set(attempt.state, { _tag: 'Rendering' });
    return { _tag: 'Rendered', value };
  }

  // oxlint-disable-next-line effecttsgo/async-function -- Browser navigation is a native Promise boundary.
  private async rollback(
    attempt: NavigationAttemptData,
    reason: NavigationRollbackReason,
    rollbackRender: () => Promise<void>,
  ) {
    if (reason === 'Aborted') {
      // The Navigation API aborts the ongoing NavigateEvent before dispatching its successor.
      // Let that dispatch finish so the successor can become active before the obsolete render is
      // cleaned up. A microtask is too early because aborting fires navigateerror synchronously.
      // https://html.spec.whatwg.org/multipage/nav-history-apis.html#fire-a-push/replace/reload-navigate-event
      await navigationDispatchCompleted();
    }

    await rollbackRender();
    MutableRef.set(attempt.state, { _tag: 'RolledBack' });
    this.clearActive(attempt);
  }

  private clearActive(attempt: NavigationAttemptData) {
    const active = MutableRef.get(this.state);
    if (active._tag === 'Active' && active.attempt === attempt) {
      MutableRef.set(this.state, { _tag: 'Idle' });
    }
  }

  private supersede(attempt: NavigationAttemptData) {
    const state = MutableRef.get(attempt.state);
    switch (state._tag) {
      case 'Pending':
      case 'Rendering':
        MutableRef.set(attempt.state, { _tag: 'Superseded' });
        break;
      case 'Completed':
      case 'Failed':
      case 'RolledBack':
      case 'Superseded':
        throw new TypeError('Only the active browser navigation can be superseded.');
    }
  }
}
