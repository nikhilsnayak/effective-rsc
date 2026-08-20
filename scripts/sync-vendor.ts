/* oxlint-disable effecttsgo/async-function, effecttsgo/global-console, effecttsgo/node-builtin-import -- Standalone Bun process adapter. */
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

type VendorBase = {
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

type Vendor = SubtreeVendor | DirectoryVendor;

const vendors = {
  effect: {
    kind: 'subtree',
    repository: 'https://github.com/Effect-TS/effect.git',
    ref: 'main',
    prefix: 'repos/effect',
    requiredPaths: ['LLMS.md', 'packages/effect/src/unstable/workflow/Workflow.ts'],
  },
  'react-server-dom-rspack': {
    kind: 'directory',
    repository: 'https://github.com/react/react.git',
    ref: 'f148045f80fb8841f3a9b098cda2aeaa7a20bb69',
    sourcePath: 'packages/react-server-dom-rspack',
    prefix: 'repos/react-server-dom-rspack',
    requiredPaths: [
      'package.json',
      'src/ReactFlightRspackReferences.js',
      'src/server/ReactFlightServerConfigRspackBundler.js',
    ],
  },
  'rspack-rsc': {
    kind: 'directory',
    repository: 'https://github.com/rstackjs/rstack-examples.git',
    ref: 'main',
    sourcePath: 'rspack/rspack-rsc',
    prefix: 'repos/rspack-rsc',
    requiredPaths: [
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
    prefix: 'repos/rsbuild-plugin-rsc',
    requiredPaths: [
      'package.json',
      'src/index.ts',
      'examples/server/src/framework/entry.rsc.tsx',
      'e2e/integration/decode-action/src/framework/entry.rsc.tsx',
    ],
  },
  'vite-plugin-rsc': {
    kind: 'directory',
    repository: 'https://github.com/vitejs/vite-plugin-react.git',
    ref: 'main',
    sourcePath: 'packages/plugin-rsc',
    prefix: 'repos/vite-plugin-rsc',
    requiredPaths: [
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
    prefix: 'repos/rsc-html-stream',
    requiredPaths: ['package.json', 'client.js', 'server.js', 'test.js'],
  },
  'cosmos-rsc': {
    kind: 'directory',
    repository: 'https://github.com/nikhilsnayak/cosmos-rsc.git',
    ref: 'main',
    sourcePath: '.',
    prefix: 'repos/cosmos-rsc',
    requiredPaths: [
      'package.json',
      'core/build/webpack.config.js',
      'core/client/index.js',
      'core/server/index.js',
    ],
  },
  twofold: {
    kind: 'directory',
    repository: 'https://github.com/twofold-rsc/twofold.git',
    ref: 'main',
    sourcePath: 'packages',
    prefix: 'repos/twofold',
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
    repository: 'https://github.com/wakujs/waku.git',
    ref: 'main',
    sourcePath: 'packages/waku',
    prefix: 'repos/waku',
    requiredPaths: [
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
  if (lines.length !== 1) return undefined;
  const [commit, remoteRef, extra] = lines[0]!.trim().split(/\s+/);
  if (extra !== undefined || remoteRef !== `refs/heads/${ref}`) return undefined;
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

  if (log.exitCode !== 0) return undefined;
  return parseSubtreeSplit(log.stdout);
};

const resolveRemoteCommit = async (vendor: Vendor, root: string) => {
  if (isCommit(vendor.ref)) return vendor.ref;

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

const fetchRemoteCommit = async (vendor: Vendor, commit: string, root: string) => {
  const fetched = await run(['git', 'fetch', '--no-tags', vendor.repository, commit], root);

  if (fetched !== 0) {
    throw new Error(`Could not fetch ${vendor.repository} at ${commit}.`);
  }

  const fetchHead = await output(['git', 'rev-parse', '--verify', 'FETCH_HEAD^{commit}'], root);
  if (fetchHead.exitCode !== 0 || fetchHead.stdout !== commit) {
    throw new Error(
      `Fetched ${fetchHead.stdout || 'nothing'} instead of expected commit ${commit}.`,
    );
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
  }
>;

const updateVendorLock = async (name: VendorName, vendor: Vendor, commit: string, root: string) => {
  const lockPath = join(root, 'repos/.vendor-lock.json');
  const lock = existsSync(lockPath)
    ? (JSON.parse(await readFile(lockPath, 'utf8')) as VendorLock)
    : {};

  lock[name] = {
    repository: vendor.repository,
    ref: vendor.ref,
    commit,
    ...(vendor.kind === 'directory' ? { sourcePath: vendor.sourcePath } : {}),
  };

  await writeFile(lockPath, `${JSON.stringify(lock, undefined, 2)}\n`);
};

const syncSubtree = async (
  name: VendorName,
  vendor: SubtreeVendor,
  commit: string,
  root: string,
) => {
  const prefixExists = existsSync(`${root}/${vendor.prefix}`);
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
  name: VendorName,
  vendor: DirectoryVendor,
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

    const isRepositoryRoot = vendor.sourcePath === '.';
    const sourceTree = await output(
      [
        'git',
        'ls-tree',
        '-r',
        '--full-tree',
        commit,
        ...(isRepositoryRoot ? [] : ['--', vendor.sourcePath]),
      ],
      temporaryRoot,
    );
    if (sourceTree.exitCode !== 0 || sourceTree.stdout === '') {
      throw new Error(`${vendor.sourcePath} does not exist at ${commit}.`);
    }
    if (sourceTree.stdout.split('\n').some((line) => line.startsWith('160000 '))) {
      throw new Error(`${vendor.sourcePath} contains nested gitlinks.`);
    }

    const materializeCommands = isRepositoryRoot
      ? [['git', 'checkout', '--quiet', '--detach', commit]]
      : [
          ['git', 'sparse-checkout', 'init', '--cone'],
          ['git', 'sparse-checkout', 'set', vendor.sourcePath],
          ['git', 'checkout', '--quiet', '--detach', commit],
        ];

    for (const command of materializeCommands) {
      if ((await run(command, temporaryRoot)) !== 0) {
        throw new Error(`Could not materialize ${vendor.sourcePath} at ${commit}.`);
      }
    }

    const source = isRepositoryRoot ? temporaryRoot : join(temporaryRoot, vendor.sourcePath);
    const destination = join(root, vendor.prefix);
    const stagedDestination = `${destination}.next-${process.pid}`;
    const temporaryGitDirectory = join(temporaryRoot, '.git');

    await rm(stagedDestination, { force: true, recursive: true });
    await mkdir(dirname(stagedDestination), { recursive: true });
    await cp(source, stagedDestination, {
      recursive: true,
      filter: (path) =>
        path !== temporaryGitDirectory && !path.startsWith(`${temporaryGitDirectory}/`),
    });

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

    console.log(`Synced ${name} from ${vendor.repository}#${commit}:${vendor.sourcePath}`);
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
};

const sync = async (name: VendorName, root: string) => {
  const vendor = vendors[name];
  const remoteCommit = await resolveRemoteCommit(vendor, root);

  if (vendor.kind === 'subtree') {
    await syncSubtree(name, vendor, remoteCommit, root);
  } else {
    await syncDirectory(name, vendor, remoteCommit, root);
    assertRequiredPaths(vendor, root);
  }

  await updateVendorLock(name, vendor, remoteCommit, root);
};

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

  for (const name of requested === 'all' ? names : [requested as VendorName]) {
    await sync(name, root.stdout);
  }
};

if (import.meta.main) {
  await main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
