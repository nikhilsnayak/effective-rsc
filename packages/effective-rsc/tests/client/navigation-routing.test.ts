import { describe, expect, it } from '@effect/vitest';

import {
  HistoryRollbackNavigationInfo,
  isHistoryRollback,
  isRoutedNavigation,
  NativeDocumentNavigationInfo,
  preserveRequestedHash,
} from '../../src/client/navigation-routing';

type RoutingFields = Pick<
  NavigateEvent,
  'canIntercept' | 'downloadRequest' | 'formData' | 'hashChange' | 'info' | 'navigationType'
>;

const makeEvent = (overrides: Partial<RoutingFields> = {}) =>
  ({
    canIntercept: true,
    downloadRequest: null,
    formData: null,
    hashChange: false,
    info: undefined,
    navigationType: 'push',
    ...overrides,
  }) as NavigateEvent;

describe('isHistoryRollback', () => {
  it('recognizes only the rollback marker ERSC dispatches', () => {
    expect(isHistoryRollback(makeEvent({ info: HistoryRollbackNavigationInfo }))).toBe(true);
    expect(isHistoryRollback(makeEvent({ info: NativeDocumentNavigationInfo }))).toBe(false);
    expect(isHistoryRollback(makeEvent())).toBe(false);
  });
});

describe('isRoutedNavigation', () => {
  it('routes an ordinary same-document navigation', () => {
    expect(isRoutedNavigation(makeEvent())).toBe(true);
    expect(isRoutedNavigation(makeEvent({ navigationType: 'replace' }))).toBe(true);
    expect(isRoutedNavigation(makeEvent({ navigationType: 'traverse' }))).toBe(true);
  });

  it('leaves navigations the router does not own to the browser', () => {
    expect(isRoutedNavigation(makeEvent({ canIntercept: false }))).toBe(false);
    expect(isRoutedNavigation(makeEvent({ hashChange: true }))).toBe(false);
    expect(isRoutedNavigation(makeEvent({ downloadRequest: '' }))).toBe(false);
    expect(isRoutedNavigation(makeEvent({ formData: new FormData() }))).toBe(false);
    expect(isRoutedNavigation(makeEvent({ navigationType: 'reload' }))).toBe(false);
  });

  it('leaves navigations ERSC itself dispatches to the browser', () => {
    expect(isRoutedNavigation(makeEvent({ info: HistoryRollbackNavigationInfo }))).toBe(false);
    expect(isRoutedNavigation(makeEvent({ info: NativeDocumentNavigationInfo }))).toBe(false);
    expect(isRoutedNavigation(makeEvent({ info: 'react-transition' }))).toBe(false);
  });
});

describe('preserveRequestedHash', () => {
  const requested = new URL('https://ersc.test/schedule#session-4');

  it('reattaches the requested fragment when the server resolved the same location', () => {
    const resolved = preserveRequestedHash(requested, new URL('https://ersc.test/schedule'));

    expect(resolved.href).toBe('https://ersc.test/schedule#session-4');
  });

  it('keeps a fragment the server resolved for itself', () => {
    const resolved = preserveRequestedHash(requested, new URL('https://ersc.test/schedule#top'));

    expect(resolved.href).toBe('https://ersc.test/schedule#top');
  });

  it('leaves a redirected location untouched', () => {
    expect(
      preserveRequestedHash(requested, new URL('https://ersc.test/schedule/saturday')).href,
    ).toBe('https://ersc.test/schedule/saturday');
    expect(preserveRequestedHash(requested, new URL('https://ersc.test/schedule?day=1')).href).toBe(
      'https://ersc.test/schedule?day=1',
    );
    expect(preserveRequestedHash(requested, new URL('https://other.test/schedule')).href).toBe(
      'https://other.test/schedule',
    );
  });

  it('adds nothing when the requested location carried no fragment', () => {
    const resolved = preserveRequestedHash(
      new URL('https://ersc.test/schedule'),
      new URL('https://ersc.test/schedule'),
    );

    expect(resolved.href).toBe('https://ersc.test/schedule');
  });
});
