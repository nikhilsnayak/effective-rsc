import { MutableRef } from 'effect';

type NavigationAttemptState =
  | { readonly _tag: 'Pending' }
  | { readonly _tag: 'Rendering' }
  | { readonly _tag: 'Failed' }
  | { readonly _tag: 'Superseded' }
  | { readonly _tag: 'Completed' }
  | { readonly _tag: 'Aborted' };

type NavigationAttemptData = {
  readonly state: MutableRef.MutableRef<NavigationAttemptState>;
};

type NavigationCoordinatorState =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Active'; readonly attempt: NavigationAttemptData };

export type NavigationRenderResult<Render> =
  | { readonly _tag: 'Rendered'; readonly value: Render }
  | { readonly _tag: 'Discarded' };

export type NavigationAttempt = {
  readonly abort: (discardRender: () => Promise<void>) => Promise<void>;
  readonly complete: () => void;
  readonly fail: () => void;
  readonly render: <Render>(render: () => Render) => NavigationRenderResult<Render>;
};

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
      abort: (discardRender) => this.abort(attempt, discardRender),
      complete: () => this.complete(attempt),
      fail: () => this.fail(attempt),
      render: (render) => this.render(attempt, render),
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

  // oxlint-disable-next-line effecttsgo/async-function -- React render retirement is a native Promise boundary.
  private async abort(attempt: NavigationAttemptData, discardRender: () => Promise<void>) {
    await discardRender();
    MutableRef.set(attempt.state, { _tag: 'Aborted' });
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
      case 'Aborted':
      case 'Superseded':
        throw new TypeError('Only the active browser navigation can be superseded.');
    }
  }
}
