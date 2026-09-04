/* oxlint-disable effecttsgo/async-function, effecttsgo/global-console, effecttsgo/node-builtin-import -- Standalone Bun process adapter. */
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

type VendorBase = {
  readonly licensePath?: string;
  readonly repository: string;
  readonly ref: string;
  readonly prefix: string;
  readonly requiredPaths: ReadonlyArray<string>;
};

type SubtreeVendor = VendorBase & {
  readonly kind: 'subtree';
};

type DirectoryVendor = VendorBase & {
  readonly kind: 'directory';
  readonly sourcePath: string;
};

type DirectoriesVendor = VendorBase & {
  readonly kind: 'directories';
  readonly directories: ReadonlyArray<{
    readonly destinationPath: string;
    readonly sourcePath: string;
  }>;
};

type Vendor = SubtreeVendor | DirectoryVendor | DirectoriesVendor;

const vendors = {
  effect: {
    kind: 'subtree',
    repository: 'https://github.com/Effect-TS/effect.git',
    ref: 'main',
    prefix: 'vendor/effect',
    requiredPaths: ['LICENSE', 'LLMS.md', 'packages/effect/src/unstable/workflow/Workflow.ts'],
  },
  'react-server-dom-rspack': {
    kind: 'directory',
    licensePath: 'LICENSE',
    repository: 'https://github.com/react/react.git',
    ref: 'f148045f80fb8841f3a9b098cda2aeaa7a20bb69',
    sourcePath: 'packages/react-server-dom-rspack',
    prefix: 'vendor/react-server-dom-rspack',
    requiredPaths: [
      'LICENSE',
      'package.json',
      'src/ReactFlightRspackReferences.js',
      'src/server/ReactFlightServerConfigRspackBundler.js',
    ],
  },
  'rspack-rsc': {
    kind: 'directory',
    licensePath: 'LICENSE',
    repository: 'https://github.com/rstackjs/rstack-examples.git',
    ref: 'main',
    sourcePath: 'rspack/rspack-rsc',
    prefix: 'vendor/rspack-rsc',
    requiredPaths: [
      'LICENSE',
      'README.md',
      'rspack.config.js',
      'src/framework/entry.client.tsx',
      'src/framework/entry.rsc.tsx',
      'src/framework/entry.ssr.tsx',
    ],
  },
  'rsbuild-plugin-rsc': {
    kind: 'directory',
    repository: 'https://github.com/rstackjs/rsbuild-plugin-rsc.git',
    ref: 'main',
    sourcePath: '.',
    prefix: 'vendor/rsbuild-plugin-rsc',
    requiredPaths: [
      'package.json',
      'src/index.ts',
      'examples/server/src/framework/entry.rsc.tsx',
      'e2e/integration/decode-action/src/framework/entry.rsc.tsx',
    ],
  },
  'vite-plugin-rsc': {
    kind: 'directory',
    licensePath: 'LICENSE',
    repository: 'https://github.com/vitejs/vite-plugin-react.git',
    ref: 'main',
    sourcePath: 'packages/plugin-rsc',
    prefix: 'vendor/vite-plugin-rsc',
    requiredPaths: [
      'LICENSE',
      'package.json',
      'src/index.ts',
      'src/plugin.ts',
      'src/transforms/server-action.ts',
    ],
  },
  'rsc-html-stream': {
    kind: 'directory',
    repository: 'https://github.com/devongovett/rsc-html-stream.git',
    ref: 'main',
    sourcePath: '.',
    prefix: 'vendor/rsc-html-stream',
    requiredPaths: ['LICENSE', 'package.json', 'client.js', 'server.js', 'test.js'],
  },
  'cosmos-rsc': {
    kind: 'directory',
    repository: 'https://github.com/nikhilsnayak/cosmos-rsc.git',
    ref: 'main',
    sourcePath: '.',
    prefix: 'vendor/cosmos-rsc',
    requiredPaths: [
      'package.json',
      'core/build/webpack.config.js',
      'core/client/index.js',
      'core/server/index.js',
    ],
  },
  'next.js': {
    kind: 'directories',
    licensePath: 'license.md',
    repository: 'https://github.com/vercel/next.js.git',
    ref: 'canary',
    directories: [
      {
        sourcePath: 'packages/next/src/server/app-render',
        destinationPath: 'server/app-render',
      },
      {
        sourcePath: 'packages/next/src/client/components',
        destinationPath: 'client/components',
      },
      {
        sourcePath: 'packages/next/src/shared/lib',
        destinationPath: 'shared/lib',
      },
    ],
    prefix: 'vendor/next.js',
    requiredPaths: [
      'LICENSE',
      'server/app-render/app-render.tsx',
      'client/components/router-reducer/fetch-server-response.ts',
      'shared/lib/app-router-types.ts',
      'shared/lib/rsc-transport.ts',
    ],
  },
  twofold: {
    kind: 'directory',
    repository: 'https://github.com/twofold-rsc/twofold.git',
    ref: 'main',
    sourcePath: 'packages',
    prefix: 'vendor/twofold',
    requiredPaths: [
      'framework/package.json',
      'framework/src/backend/runtime/page-request.ts',
      'framework/src/client/apps/client/browser/router-hooks.ts',
      'client-component-transforms/src/transform.ts',
      'server-function-transforms/src/plugins/server-transform-plugin.ts',
    ],
  },
  waku: {
    kind: 'directory',
    licensePath: 'LICENSE',
    repository: 'https://github.com/wakujs/waku.git',
    ref: 'main',
    sourcePath: 'packages/waku',
    prefix: 'vendor/waku',
    requiredPaths: [
      'LICENSE',
      'package.json',
      'src/adapters/bun.ts',
      'src/lib/vite-rsc/handler.ts',
      'src/lib/vite-rsc/ssr.tsx',
      'src/router/client.tsx',
    ],
  },
} satisfies Record<string, Vendor>;

type VendorName = keyof typeof vendors;

const run = async (command: ReadonlyArray<string>, cwd?: string) => {
  const child = Bun.spawn([...command], {
    ...(cwd === undefined ? {} : { cwd }),
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  return child.exited;
};

const output = async (command: ReadonlyArray<string>, cwd?: string) => {
  const child = Bun.spawn([...command], {
    ...(cwd === undefined ? {} : { cwd }),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
};

export const parseSubtreeSplit = (message: string): string | undefined =>
  /^git-subtree-split: ([0-9a-f]{40})$/m.exec(message)?.[1];

export const parseRemoteCommit = (remoteOutput: string, ref: string): string | undefined => {
  const lines = remoteOutput.trim().split('\n');
  if (lines.length !== 1) {
    return undefined;
  }
  const [commit, remoteRef, extra] = lines[0]!.trim().split(/\s+/);
  if (extra !== undefined || remoteRef !== `refs/heads/${ref}`) {
    return undefined;
  }
  return /^[0-9a-f]{40}$/.test(commit ?? '') ? commit : undefined;
};

export const isCommit = (ref: string) => /^[0-9a-f]{40}$/.test(ref);

const subtreeSplit = async (vendor: Vendor, root: string) => {
  const log = await output(
    [
      'git',
      'log',
      '-1',
      '--format=%B',
      '--fixed-strings',
      `--grep=git-subtree-dir: ${vendor.prefix}`,
      'HEAD',
    ],
    root,
  );

  if (log.exitCode !== 0) {
    return undefined;
  }
  return parseSubtreeSplit(log.stdout);
};

const resolveRemoteCommit = async (vendor: Vendor, root: string) => {
  if (isCommit(vendor.ref)) {
    return vendor.ref;
  }

  const remote = await output(
    ['git', 'ls-remote', '--exit-code', vendor.repository, `refs/heads/${vendor.ref}`],
    root,
  );
  const commit = parseRemoteCommit(remote.stdout, vendor.ref);

  if (remote.exitCode !== 0 || commit === undefined) {
    throw new Error(`Could not resolve ${vendor.repository}#${vendor.ref}.`);
  }

  return commit;
};

export const fetchRemoteCommit = async (vendor: Vendor, commit: string, root: string) => {
  const fetchRef = `refs/ersc/vendor-sync/${process.pid}-${Bun.randomUUIDv7()}`;
  const removeFetchRef = () => run(['git', 'update-ref', '-d', fetchRef], root);

  try {
    const fetched = await run(
      [
        'git',
        'fetch',
        '--no-tags',
        '--no-write-fetch-head',
        vendor.repository,
        `+${commit}:${fetchRef}`,
      ],
      root,
    );

    if (fetched !== 0) {
      throw new Error(`Could not fetch ${vendor.repository} at ${commit}.`);
    }

    const fetchedCommit = await output(
      ['git', 'rev-parse', '--verify', `${fetchRef}^{commit}`],
      root,
    );
    if (fetchedCommit.exitCode !== 0 || fetchedCommit.stdout !== commit) {
      throw new Error(
        `Fetched ${fetchedCommit.stdout || 'nothing'} instead of expected commit ${commit}.`,
      );
    }
  } catch (error) {
    await removeFetchRef();
    throw error;
  }
  if ((await removeFetchRef()) !== 0) {
    throw new Error(`Could not remove the temporary fetch ref ${fetchRef}.`);
  }
};

const assertNoGitlinks = async (vendor: Vendor, root: string) => {
  const files = await output(['git', 'ls-files', '--stage', '--', vendor.prefix], root);
  const gitlinks = files.stdout
    .split('\n')
    .filter((line) => line.startsWith('160000 '))
    .map((line) => line.slice(line.indexOf('\t') + 1));

  if (gitlinks.length > 0) {
    throw new Error(`Nested gitlinks found:\n${gitlinks.join('\n')}`);
  }
};

const assertRequiredPaths = (vendor: Vendor, root: string) => {
  const missingPaths = vendor.requiredPaths.filter(
    (path) => !existsSync(join(root, vendor.prefix, path)),
  );
  if (missingPaths.length > 0) {
    throw new Error(
      `The ${vendor.prefix} vendor is missing required paths:\n${missingPaths.join('\n')}`,
    );
  }
};

type VendorLock = Record<
  string,
  {
    readonly repository: string;
    readonly ref: string;
    readonly commit: string;
    readonly sourcePath?: string;
    readonly sourcePaths?: ReadonlyArray<{
      readonly destinationPath: string;
      readonly sourcePath: string;
    }>;
  }
>;

const updateVendorLock = async (name: string, vendor: Vendor, commit: string, root: string) => {
  const lockPath = join(root, 'vendor/.vendor-lock.json');
  const lockFile = Bun.file(lockPath);
  const lock: VendorLock = (await lockFile.exists()) ? await lockFile.json() : {};

  lock[name] = {
    repository: vendor.repository,
    ref: vendor.ref,
    commit,
    ...(vendor.kind === 'directory' ? { sourcePath: vendor.sourcePath } : {}),
    ...(vendor.kind === 'directories' ? { sourcePaths: vendor.directories } : {}),
  };

  await Bun.write(lockPath, `${JSON.stringify(lock, undefined, 2)}\n`);
};

const commitSubtreeVendorLock = async (name: string, root: string, headBeforeSync: string) => {
  if ((await run(['git', 'add', '--', 'vendor/.vendor-lock.json'], root)) !== 0) {
    throw new Error(`Could not stage the ${name} vendor lock update.`);
  }

  const staged = await run(
    ['git', 'diff', '--cached', '--quiet', '--', 'vendor/.vendor-lock.json'],
    root,
  );
  if (staged === 0) {
    return;
  }
  if (staged !== 1) {
    throw new Error(`Could not inspect the staged ${name} vendor lock update.`);
  }

  const headAfterSync = await output(['git', 'rev-parse', '--verify', 'HEAD'], root);
  if (headAfterSync.exitCode !== 0) {
    throw new Error(`Could not read HEAD after syncing ${name}.`);
  }

  const commitCommand =
    headAfterSync.stdout === headBeforeSync
      ? ['git', 'commit', '-m', `chore: sync ${name} vendor lock`]
      : ['git', 'commit', '--amend', '--no-edit'];
  if ((await run(commitCommand, root)) !== 0) {
    throw new Error(`Could not commit the ${name} vendor lock update.`);
  }
};

const syncSubtree = async (name: string, vendor: SubtreeVendor, commit: string, root: string) => {
  const prefixExists = existsSync(join(root, vendor.prefix));
  const existingSplit = await subtreeSplit(vendor, root);

  if (prefixExists && existingSplit === undefined) {
    throw new Error(
      `${vendor.prefix} exists without git subtree metadata. Remove the copied directory in a clean commit before retrying.`,
    );
  }

  await fetchRemoteCommit(vendor, commit, root);

  const operation = prefixExists ? 'merge' : 'add';
  console.log(
    `${operation === 'add' ? 'Adding' : 'Syncing'} ${name} from ${vendor.repository}#${vendor.ref}`,
  );

  const exitCode = await run(
    ['git', 'subtree', operation, `--prefix=${vendor.prefix}`, commit, '--squash'],
    root,
  );

  if (exitCode !== 0) {
    throw new Error(
      `Could not ${operation} ${name}. Confirm git-subtree is installed and resolve the Git state before retrying.`,
    );
  }

  const syncedSplit = await subtreeSplit(vendor, root);
  if (syncedSplit !== commit) {
    throw new Error(
      `The ${name} subtree recorded ${syncedSplit ?? 'no split commit'} instead of ${commit}.`,
    );
  }

  await assertNoGitlinks(vendor, root);
  assertRequiredPaths(vendor, root);
};

const syncDirectory = async (
  name: string,
  vendor: DirectoryVendor | DirectoriesVendor,
  commit: string,
  root: string,
) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'effective-rsc-vendor-'));

  try {
    if ((await run(['git', 'init', '--quiet'], temporaryRoot)) !== 0) {
      throw new Error(`Could not initialize the temporary repository for ${name}.`);
    }
    if ((await run(['git', 'remote', 'add', 'origin', vendor.repository], temporaryRoot)) !== 0) {
      throw new Error(`Could not configure the temporary repository for ${name}.`);
    }
    if (
      (await run(
        [
          'git',
          '-c',
          'protocol.version=2',
          'fetch',
          '--depth=1',
          '--filter=blob:none',
          'origin',
          commit,
        ],
        temporaryRoot,
      )) !== 0
    ) {
      throw new Error(`Could not fetch ${vendor.repository} at ${commit}.`);
    }

    const fetchHead = await output(
      ['git', 'rev-parse', '--verify', 'FETCH_HEAD^{commit}'],
      temporaryRoot,
    );
    if (fetchHead.exitCode !== 0 || fetchHead.stdout !== commit) {
      throw new Error(
        `Fetched ${fetchHead.stdout || 'nothing'} instead of expected commit ${commit}.`,
      );
    }

    const directories =
      vendor.kind === 'directory'
        ? [{ sourcePath: vendor.sourcePath, destinationPath: '.' }]
        : vendor.directories;
    const isRepositoryRoot = directories.length === 1 && directories[0]?.sourcePath === '.';

    for (const directory of directories) {
      const sourceTree = await output(
        [
          'git',
          'ls-tree',
          '-r',
          '--full-tree',
          commit,
          ...(directory.sourcePath === '.' ? [] : ['--', directory.sourcePath]),
        ],
        temporaryRoot,
      );
      if (sourceTree.exitCode !== 0 || sourceTree.stdout === '') {
        throw new Error(`${directory.sourcePath} does not exist at ${commit}.`);
      }
      if (sourceTree.stdout.split('\n').some((line) => line.startsWith('160000 '))) {
        throw new Error(`${directory.sourcePath} contains nested gitlinks.`);
      }
    }

    const materializeCommands = isRepositoryRoot
      ? [['git', 'checkout', '--quiet', '--detach', commit]]
      : [
          ['git', 'sparse-checkout', 'init', '--cone'],
          ['git', 'sparse-checkout', 'set', ...directories.map(({ sourcePath }) => sourcePath)],
          ['git', 'checkout', '--quiet', '--detach', commit],
        ];

    for (const command of materializeCommands) {
      if ((await run(command, temporaryRoot)) !== 0) {
        throw new Error(`Could not materialize ${name} at ${commit}.`);
      }
    }

    const destination = join(root, vendor.prefix);
    const stagedDestination = `${destination}.next-${process.pid}`;
    const temporaryGitDirectory = join(temporaryRoot, '.git');

    await rm(stagedDestination, { force: true, recursive: true });
    await mkdir(dirname(stagedDestination), { recursive: true });

    if (vendor.kind === 'directory') {
      const source = isRepositoryRoot ? temporaryRoot : join(temporaryRoot, vendor.sourcePath);
      await cp(source, stagedDestination, {
        recursive: true,
        filter: (path) =>
          path !== temporaryGitDirectory && !path.startsWith(`${temporaryGitDirectory}/`),
      });
    } else {
      await mkdir(stagedDestination, { recursive: true });
      for (const directory of directories) {
        const stagedDirectory = join(stagedDestination, directory.destinationPath);
        await mkdir(dirname(stagedDirectory), { recursive: true });
        await cp(join(temporaryRoot, directory.sourcePath), stagedDirectory, { recursive: true });
      }
    }

    if (vendor.licensePath !== undefined) {
      const license = join(temporaryRoot, vendor.licensePath);
      if (!existsSync(license)) {
        throw new Error(`${vendor.licensePath} does not exist at ${commit}.`);
      }
      await cp(license, join(stagedDestination, 'LICENSE'));
    }

    const missingPaths = vendor.requiredPaths.filter(
      (path) => !existsSync(join(stagedDestination, path)),
    );
    if (missingPaths.length > 0) {
      await rm(stagedDestination, { force: true, recursive: true });
      throw new Error(
        `The ${name} snapshot is missing required paths:\n${missingPaths.join('\n')}`,
      );
    }

    await rm(destination, { force: true, recursive: true });
    await cp(stagedDestination, destination, { recursive: true });
    await rm(stagedDestination, { force: true, recursive: true });

    const sourceDescription = directories.map(({ sourcePath }) => sourcePath).join(', ');
    console.log(`Synced ${name} from ${vendor.repository}#${commit}:${sourceDescription}`);
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
};

export const syncVendor = async (name: string, vendor: Vendor, root: string) => {
  const remoteCommit = await resolveRemoteCommit(vendor, root);
  const headBeforeSync =
    vendor.kind === 'subtree'
      ? await output(['git', 'rev-parse', '--verify', 'HEAD'], root)
      : undefined;

  if (headBeforeSync !== undefined && headBeforeSync.exitCode !== 0) {
    throw new Error(`Could not read HEAD before syncing ${name}.`);
  }

  if (vendor.kind === 'subtree') {
    await syncSubtree(name, vendor, remoteCommit, root);
  } else {
    await syncDirectory(name, vendor, remoteCommit, root);
    assertRequiredPaths(vendor, root);
  }

  await updateVendorLock(name, vendor, remoteCommit, root);
  if (headBeforeSync !== undefined) {
    await commitSubtreeVendorLock(name, root, headBeforeSync.stdout);
  }
};

const sync = async (name: VendorName, root: string) => syncVendor(name, vendors[name], root);

const main = async () => {
  const requested = Bun.argv[2];
  const names = Object.keys(vendors) as Array<VendorName>;

  if (requested === '--help' || requested === '-h') {
    console.log(`Usage: bun run vendor:sync <${names.join('|')}|all>`);
    return;
  }

  if (requested !== 'all' && !names.includes(requested as VendorName)) {
    throw new Error(`Usage: bun run vendor:sync <${names.join('|')}|all>`);
  }

  const root = await output(['git', 'rev-parse', '--show-toplevel']);
  if (root.exitCode !== 0 || root.stdout === '') {
    throw new Error('Run vendor sync inside a Git repository with an initial commit.');
  }

  const head = await output(['git', 'rev-parse', '--verify', 'HEAD'], root.stdout);
  if (head.exitCode !== 0) {
    throw new Error('Create the initial commit before syncing vendored repositories.');
  }

  const status = await output(['git', 'status', '--porcelain'], root.stdout);
  if (status.stdout !== '') {
    throw new Error('The worktree must be clean before syncing vendored repositories.');
  }

  const requestedNames =
    requested === 'all'
      ? [
          ...names.filter((name) => vendors[name].kind === 'subtree'),
          ...names.filter((name) => vendors[name].kind !== 'subtree'),
        ]
      : [requested as VendorName];

  for (const name of requestedNames) {
    await sync(name, root.stdout);
  }
};

if (import.meta.main) {
  await main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
