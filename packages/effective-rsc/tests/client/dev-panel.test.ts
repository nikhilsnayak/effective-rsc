import { describe, expect, it } from '@effect/vitest';

import {
  applyDevPanelEvent,
  type DevPanelEvent,
  InitialDevPanelState,
  type DevRuntimeFailure,
} from '../../src/dev/panel';

const runtimeFailure = (message: string): DevRuntimeFailure => ({
  _tag: 'RuntimeError',
  name: 'Error',
  message,
  stack: `Error: ${message}`,
});

const apply = (...events: ReadonlyArray<DevPanelEvent>) =>
  events.reduce(applyDevPanelEvent, InitialDevPanelState);

describe('development panel state', () => {
  const warning: DevPanelEvent = { _tag: 'Warning', message: 'Links use full-page navigation.' };

  it('keeps warnings through successful builds and renders until dismissed', () => {
    const visible = apply(warning, { _tag: 'BuildSucceeded' }, { _tag: 'RuntimeReconciled' });
    expect(visible).toEqual({ _tag: 'Visible', content: warning });
    const dismissed = applyDevPanelEvent(visible, { _tag: 'Dismissed' });
    expect(dismissed).toEqual({ _tag: 'Dismissed', content: warning });
    expect(applyDevPanelEvent(dismissed, warning)).toBe(dismissed);
    expect(applyDevPanelEvent(dismissed, { _tag: 'RuntimeReconciled' })).toBe(dismissed);
  });

  it('gives failures precedence over warnings in either arrival order', () => {
    for (const failure of [
      { _tag: 'BuildFailed', diagnostics: 'Compilation failed' },
      { _tag: 'RuntimeFailed', failure: runtimeFailure('runtime failed') },
      { _tag: 'RenderFailed', failure: runtimeFailure('render failed') },
    ] satisfies ReadonlyArray<DevPanelEvent>) {
      const failed = apply(failure);
      expect(apply(warning, failure)).toEqual(failed);
      expect(apply(failure, warning)).toEqual(failed);
    }
  });

  it('gives build failures precedence over runtime failures', () => {
    expect(
      apply(
        { _tag: 'RuntimeFailed', failure: runtimeFailure('render failed') },
        { _tag: 'BuildFailed', diagnostics: 'Compilation failed' },
        { _tag: 'RuntimeFailed', failure: runtimeFailure('another failure') },
      ),
    ).toEqual({
      _tag: 'Visible',
      content: {
        _tag: 'BuildFailed',
        diagnostics: 'Compilation failed',
      },
    });
  });

  it('deduplicates runtime failures and retains the five newest failures', () => {
    const state = apply(
      ...['one', 'two', 'three', 'four', 'five', 'six', 'six'].map((message): DevPanelEvent => ({
        _tag: 'RuntimeFailed',
        failure: runtimeFailure(message),
      })),
    );

    expect(state).toEqual({
      _tag: 'Visible',
      content: {
        _tag: 'RuntimeFailed',
        failures: ['two', 'three', 'four', 'five', 'six'].map(runtimeFailure),
      },
    });
  });

  it('dismisses the current failure and reopens it when another failure arrives', () => {
    const dismissed = apply(
      { _tag: 'BuildFailed', diagnostics: 'Compilation failed' },
      { _tag: 'Dismissed' },
    );

    expect(dismissed).toEqual({
      _tag: 'Dismissed',
      content: {
        _tag: 'BuildFailed',
        diagnostics: 'Compilation failed',
      },
    });
    expect(applyDevPanelEvent(dismissed, { _tag: 'Opened' })).toEqual({
      _tag: 'Visible',
      content: {
        _tag: 'BuildFailed',
        diagnostics: 'Compilation failed',
      },
    });
    expect(
      applyDevPanelEvent(dismissed, {
        _tag: 'RuntimeFailed',
        failure: runtimeFailure('render failed'),
      }),
    ).toEqual({
      _tag: 'Visible',
      content: {
        _tag: 'BuildFailed',
        diagnostics: 'Compilation failed',
      },
    });
  });

  it('clears failures only after reconciliation', () => {
    const failed = apply({ _tag: 'RuntimeFailed', failure: runtimeFailure('render failed') });

    expect(applyDevPanelEvent(failed, { _tag: 'RuntimeReconciled' })).toEqual({
      _tag: 'Inactive',
    });
  });

  it('replaces build diagnostics when the replacement reaches React but still fails', () => {
    const state = apply(
      { _tag: 'BuildFailed', diagnostics: 'Compilation failed' },
      { _tag: 'BuildSucceeded' },
      { _tag: 'RenderFailed', failure: runtimeFailure('replacement still fails') },
    );
    expect(state).toEqual({
      _tag: 'Visible',
      content: { _tag: 'RuntimeFailed', failures: [runtimeFailure('replacement still fails')] },
    });
  });

  it('keeps visible and dismissed build failures until the build succeeds', () => {
    const failed = apply({ _tag: 'BuildFailed', diagnostics: 'Compilation failed' });
    const dismissed = applyDevPanelEvent(failed, { _tag: 'Dismissed' });
    for (const state of [failed, dismissed]) {
      expect(applyDevPanelEvent(state, { _tag: 'RuntimeReconciled' })).toBe(state);
      expect(
        applyDevPanelEvent(state, {
          _tag: 'RenderFailed',
          failure: runtimeFailure('old tree failed'),
        }),
      ).toBe(state);
      expect(applyDevPanelEvent(state, { _tag: 'BuildSucceeded' })).toEqual({ _tag: 'Inactive' });
    }
  });

  it('does not treat build success as runtime recovery', () => {
    const failed = apply({ _tag: 'RenderFailed', failure: runtimeFailure('render failed') });
    const dismissed = applyDevPanelEvent(failed, { _tag: 'Dismissed' });
    for (const state of [failed, dismissed]) {
      expect(applyDevPanelEvent(state, { _tag: 'BuildSucceeded' })).toBe(state);
      expect(applyDevPanelEvent(state, { _tag: 'RuntimeReconciled' })).toEqual({
        _tag: 'Inactive',
      });
    }
  });
});
