import { describe, expect, it } from 'vitest';

import { parseRemoteCommit, parseSubtreeSplit } from './sync-vendor';

const commit = '0123456789abcdef0123456789abcdef01234567';

describe('vendor sync metadata parsing', () => {
  it('reads an exact subtree split trailer from a squashed commit message', () => {
    expect(
      parseSubtreeSplit(
        `Squashed 'repos/effect/' changes\n\ngit-subtree-dir: repos/effect\ngit-subtree-split: ${commit}`,
      ),
    ).toBe(commit);
  });

  it.each([
    'git-subtree-dir: repos/effect',
    'git-subtree-split: 0123',
    'git-subtree-split: 0123456789ABCDEF0123456789ABCDEF01234567',
    `git-subtree-sha: ${commit}`,
  ])('rejects malformed subtree metadata: %s', (message) => {
    expect(parseSubtreeSplit(message)).toBeUndefined();
  });

  it('reads the exact requested branch from ls-remote output', () => {
    expect(parseRemoteCommit(`${commit}\trefs/heads/main`, 'main')).toBe(commit);
  });

  it.each([
    ['', 'main'],
    ['0123\trefs/heads/main', 'main'],
    ['0123456789ABCDEF0123456789ABCDEF01234567\trefs/heads/main', 'main'],
    [`${commit}\trefs/heads/next`, 'main'],
    [`${commit}\trefs/heads/main\n${commit}\trefs/heads/next`, 'main'],
  ])('rejects malformed or unexpected remote output', (remoteOutput, ref) => {
    expect(parseRemoteCommit(remoteOutput, ref)).toBeUndefined();
  });
});
