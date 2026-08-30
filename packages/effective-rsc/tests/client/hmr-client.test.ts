import { describe, expect, it } from '@effect/vitest';

import {
  decideHotUpdate,
  type HotUpdateCheck,
  type HotUpdateDecision,
} from '../../src/dev/hmr-update';

const pending = {
  acknowledgedClientHash: 'client-one',
  clientHash: 'client-two',
  rscRefresh: 'Pending',
} as const;

const decide = (check: HotUpdateCheck): HotUpdateDecision => decideHotUpdate(pending, check);

describe('development hot update reconciliation', () => {
  it('reloads when checking for a client update fails', () => {
    expect(decide({ _tag: 'Failed' })).toEqual({ _tag: 'Reload' });
  });

  it('acknowledges the runtime hash after applying a client update', () => {
    expect(
      decide({
        _tag: 'Completed',
        currentHash: 'client-two',
        previousHash: 'client-one',
        updatedModules: ['client-component.tsx'],
      }),
    ).toEqual({ _tag: 'Retry', acknowledgedClientHash: 'client-two' });
  });

  it('reloads when updated modules do not advance the runtime hash', () => {
    expect(
      decide({
        _tag: 'Completed',
        currentHash: 'client-one',
        previousHash: 'client-one',
        updatedModules: ['client-component.tsx'],
      }),
    ).toEqual({ _tag: 'Reload' });
  });

  it('acknowledges an RSC-only compilation without reloading', () => {
    expect(
      decide({
        _tag: 'Completed',
        currentHash: 'client-one',
        previousHash: 'client-one',
        updatedModules: null,
      }),
    ).toEqual({ _tag: 'Retry', acknowledgedClientHash: 'client-two' });
  });

  it('reloads when a client-only compilation has no applicable update', () => {
    expect(
      decideHotUpdate(
        { ...pending, rscRefresh: 'Current' },
        {
          _tag: 'Completed',
          currentHash: 'client-one',
          previousHash: 'client-one',
          updatedModules: null,
        },
      ),
    ).toEqual({ _tag: 'Reload' });
  });
});
