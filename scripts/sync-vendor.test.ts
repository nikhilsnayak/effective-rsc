/* oxlint-disable effecttsgo/async-function, effecttsgo/node-builtin-import -- Git integration test adapter. */
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  fetchRemoteCommit,
  isCommit,
  parseRemoteCommit,
  parseSubtreeSplit,
  syncVendor,
} from './sync-vendor';

const commit = '0123456789abcdef0123456789abcdef01234567';

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes).trim();

const git = (cwd: string, ...args: ReadonlyArray<string>) => {
  const result = Bun.spawnSync(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed:\n${decode(result.stderr)}`);
  }
  return decode(result.stdout);
};

const commitFile = async (repository: string, path: string, contents: string, message: string) => {
  const absolutePath = join(repository, path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await Bun.write(absolutePath, contents);
  git(repository, 'add', '--', path);
  git(repository, 'commit', '--quiet', '-m', message);
  return git(repository, 'rev-parse', 'HEAD');
};

const initializeRepository = (repository: string) => {
  git(repository, 'init', '--quiet');
  git(repository, 'config', 'user.name', 'Vendor Sync Test');
  git(repository, 'config', 'user.email', 'vendor-sync@example.invalid');
};

const createRemote = async (temporaryRoot: string) => {
  const source = join(temporaryRoot, 'source');
  const remote = join(temporaryRoot, 'remote.git');
  await mkdir(source);
  await mkdir(remote);
  initializeRepository(source);
  git(remote, 'init', '--quiet', '--bare');

  const firstCommit = await commitFile(source, 'required.txt', 'first\n', 'first');
  git(source, 'remote', 'add', 'origin', remote);
  git(source, 'push', '--quiet', 'origin', 'HEAD:refs/heads/main');
  const secondCommit = await commitFile(source, 'required.txt', 'second\n', 'second');
  git(source, 'push', '--quiet', 'origin', 'HEAD:refs/heads/main');

  return { firstCommit, remote, secondCommit };
};

const fixtureVendor = (repository: string, ref: string) => ({
  kind: 'subtree' as const,
  repository,
  ref,
  prefix: 'repos/fixture',
  requiredPaths: ['required.txt'],
});

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

  it('recognizes an immutable lowercase commit ref', () => {
    expect(isCommit(commit)).toBe(true);
  });

  it.each(['main', '0123', '0123456789ABCDEF0123456789ABCDEF01234567', `${commit}0`])(
    'rejects a mutable or malformed commit ref: %s',
    (ref) => {
      expect(isCommit(ref)).toBe(false);
    },
  );
});

describe('vendor sync Git integration', () => {
  it('preserves FETCH_HEAD and removes its temporary fetch ref', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'effective-rsc-vendor-test-'));
    try {
      const { firstCommit, remote, secondCommit } = await createRemote(temporaryRoot);
      const root = join(temporaryRoot, 'root');
      await mkdir(root);
      initializeRepository(root);
      await commitFile(root, 'README.md', 'root\n', 'root');

      const fetchHead = join(root, '.git/FETCH_HEAD');
      await Bun.write(fetchHead, `${firstCommit}\n`);

      await expect(
        fetchRemoteCommit(fixtureVendor(remote, secondCommit), secondCommit, root),
      ).resolves.toBeUndefined();

      expect((await Bun.file(fetchHead).text()).trim()).toBe(firstCommit);
      expect(git(root, 'for-each-ref', '--format=%(refname)', 'refs/ersc/vendor-sync')).toBe('');
    } finally {
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('includes the updated lockfile in the subtree sync commit', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'effective-rsc-vendor-test-'));

    try {
      const { firstCommit, remote, secondCommit } = await createRemote(temporaryRoot);
      const root = join(temporaryRoot, 'root');
      await mkdir(root);
      initializeRepository(root);
      await commitFile(
        root,
        'repos/.vendor-lock.json',
        `${JSON.stringify(
          {
            fixture: {
              repository: remote,
              ref: firstCommit,
              commit: firstCommit,
            },
          },
          undefined,
          2,
        )}\n`,
        'initialize vendor lock',
      );
      git(root, 'subtree', 'add', '--prefix=repos/fixture', remote, firstCommit, '--squash');
      const headBeforeSync = git(root, 'rev-parse', 'HEAD');

      const vendor = fixtureVendor(remote, secondCommit);
      await syncVendor('fixture', vendor, root);

      const committedLock = JSON.parse(git(root, 'show', 'HEAD:repos/.vendor-lock.json')) as Record<
        string,
        { readonly commit: string }
      >;
      expect(committedLock['fixture']?.commit).toBe(secondCommit);
      expect(git(root, 'rev-list', '--first-parent', '--count', `${headBeforeSync}..HEAD`)).toBe(
        '1',
      );
      expect(git(root, 'diff', '--name-only', headBeforeSync, 'HEAD').split('\n')).toEqual([
        'repos/.vendor-lock.json',
        'repos/fixture/required.txt',
      ]);
      expect(git(root, 'status', '--porcelain')).toBe('');
    } finally {
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('includes the lockfile when adding a new subtree', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'effective-rsc-vendor-test-'));

    try {
      const { remote, secondCommit } = await createRemote(temporaryRoot);
      const root = join(temporaryRoot, 'root');
      await mkdir(root);
      initializeRepository(root);
      await commitFile(root, 'README.md', 'root\n', 'root');
      const headBeforeSync = git(root, 'rev-parse', 'HEAD');

      await syncVendor('fixture', fixtureVendor(remote, secondCommit), root);

      expect(git(root, 'rev-list', '--first-parent', '--count', `${headBeforeSync}..HEAD`)).toBe(
        '1',
      );
      expect(git(root, 'diff', '--name-only', headBeforeSync, 'HEAD').split('\n')).toEqual([
        'repos/.vendor-lock.json',
        'repos/fixture/required.txt',
      ]);
      expect(git(root, 'status', '--porcelain')).toBe('');
    } finally {
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('does not create a commit when the subtree and lockfile are current', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'effective-rsc-vendor-test-'));

    try {
      const { remote, secondCommit } = await createRemote(temporaryRoot);
      const root = join(temporaryRoot, 'root');
      await mkdir(root);
      initializeRepository(root);
      await commitFile(root, 'README.md', 'root\n', 'root');
      const vendor = fixtureVendor(remote, secondCommit);
      await syncVendor('fixture', vendor, root);
      const headBeforeSync = git(root, 'rev-parse', 'HEAD');

      await syncVendor('fixture', vendor, root);

      expect(git(root, 'rev-parse', 'HEAD')).toBe(headBeforeSync);
      expect(git(root, 'status', '--porcelain')).toBe('');
    } finally {
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  });
});
