import { MutableRef } from 'effect';

import type { BrowserNavigation } from './browser-navigation';

const HistoryRollbackInfo = 'ersc-history-rollback';

type NavigationRollbackTarget =
  | { readonly _tag: 'Replace'; readonly state: unknown; readonly url: string }
  | { readonly _tag: 'Traverse'; readonly key: string };

type NavigationAttemptOutcome = 'Preserve' | 'Restore';

type NavigationAttemptState =
  | {
      readonly _tag: 'Pending';
      readonly outcome: PromiseWithResolvers<NavigationAttemptOutcome>;
    }
  | { readonly _tag: 'Rendering' }
  | { readonly _tag: 'Failed' }
  | { readonly _tag: 'Superseded'; readonly outcome: Promise<NavigationAttemptOutcome> }
  | { readonly _tag: 'Completed' }
  | { readonly _tag: 'RolledBack' };

type NavigationAttemptData = {
  readonly rollbackTarget: NavigationRollbackTarget;
  readonly state: MutableRef.MutableRef<NavigationAttemptState>;
};

type NavigationCoordinatorState =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Active'; readonly attempt: NavigationAttemptData };

type NavigationRenderResult<Render> =
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

const navigationFinished = (result: NavigationResult) => result.finished ?? Promise.resolve();

const attemptOutcome = (attempt: NavigationAttemptData): Promise<NavigationAttemptOutcome> => {
  const state = MutableRef.get(attempt.state);
  switch (state._tag) {
    case 'Completed':
    case 'Rendering':
      return Promise.resolve('Preserve');
    case 'Failed':
    case 'RolledBack':
      return Promise.resolve('Restore');
    case 'Pending':
      return state.outcome.promise;
    case 'Superseded':
      return state.outcome;
  }
};

export class BrowserNavigationCoordinator {
  private readonly state = MutableRef.make<NavigationCoordinatorState>({ _tag: 'Idle' });
  private readonly browserNavigation: BrowserNavigation['Service'];

  constructor(browserNavigation: BrowserNavigation['Service']) {
    this.browserNavigation = browserNavigation;
  }

  begin(navigationType: NavigationType): NavigationAttempt {
    const active = MutableRef.get(this.state);
    const attempt: NavigationAttemptData = {
      rollbackTarget:
        active._tag === 'Active'
          ? active.attempt.rollbackTarget
          : this.makeRollbackTarget(navigationType),
      state: MutableRef.make<NavigationAttemptState>({
        _tag: 'Pending',
        outcome: Promise.withResolvers<NavigationAttemptOutcome>(),
      }),
    };
    if (active._tag === 'Active') {
      this.supersede(active.attempt, attempt);
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
    state.outcome.resolve('Restore');
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
    state.outcome.resolve('Preserve');
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
      // One microtask lets begin() observe that successor before deciding whether to restore.
      // https://html.spec.whatwg.org/multipage/nav-history-apis.html#fire-a-push/replace/reload-navigate-event
      await Promise.resolve();
    }

    const state = MutableRef.get(attempt.state);
    const outcome = state._tag === 'Superseded' ? await state.outcome : 'Restore';
    await rollbackRender();
    if (outcome === 'Restore') {
      await this.rollbackHistory(attempt.rollbackTarget);
      MutableRef.set(attempt.state, { _tag: 'RolledBack' });
      this.clearActive(attempt);
    }
  }

  private clearActive(attempt: NavigationAttemptData) {
    const active = MutableRef.get(this.state);
    if (active._tag === 'Active' && active.attempt === attempt) {
      MutableRef.set(this.state, { _tag: 'Idle' });
    }
  }

  private makeRollbackTarget(navigationType: NavigationType): NavigationRollbackTarget {
    const currentEntry = this.browserNavigation.navigation.currentEntry;
    if (navigationType !== 'replace' && currentEntry !== null) {
      return { _tag: 'Traverse', key: currentEntry.key };
    }
    return {
      _tag: 'Replace',
      state: currentEntry?.getState(),
      url: currentEntry?.url ?? this.browserNavigation.location.href,
    };
  }

  private rollbackHistory(target: NavigationRollbackTarget): Promise<unknown> {
    switch (target._tag) {
      case 'Replace':
        if (this.browserNavigation.navigation.currentEntry?.url === target.url) {
          return Promise.resolve();
        }
        return navigationFinished(
          this.browserNavigation.navigation.navigate(target.url, {
            history: 'replace',
            info: HistoryRollbackInfo,
            state: target.state,
          }),
        );
      case 'Traverse':
        if (this.browserNavigation.navigation.currentEntry?.key === target.key) {
          return Promise.resolve();
        }
        return navigationFinished(
          this.browserNavigation.navigation.traverseTo(target.key, {
            info: HistoryRollbackInfo,
          }),
        );
    }
  }

  private supersede(attempt: NavigationAttemptData, successor: NavigationAttemptData) {
    const state = MutableRef.get(attempt.state);
    const outcome = attemptOutcome(successor);
    switch (state._tag) {
      case 'Pending':
        MutableRef.set(attempt.state, { _tag: 'Superseded', outcome });
        state.outcome.resolve(outcome);
        break;
      case 'Rendering':
        MutableRef.set(attempt.state, { _tag: 'Superseded', outcome });
        break;
      case 'Completed':
      case 'Failed':
      case 'RolledBack':
      case 'Superseded':
        throw new TypeError('Only the active browser navigation can be superseded.');
    }
  }
}

export const isHistoryRollback = (event: NavigateEvent) => event.info === HistoryRollbackInfo;
