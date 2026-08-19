/* oxlint-disable effecttsgo/async-function, effecttsgo/global-console, effecttsgo/node-builtin-import -- Standalone Bun process adapter. */
import { existsSync } from 'node:fs';

type Vendor = {
  readonly repository: string;
  readonly ref: string;
  readonly prefix: string;
  readonly requiredPaths: ReadonlyArray<string>;
};

const vendors = {
  effect: {
    repository: 'https://github.com/Effect-TS/effect.git',
    ref: 'main',
    prefix: 'repos/effect',
    requiredPaths: ['LLMS.md', 'packages/effect/src/unstable/workflow/Workflow.ts'],
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

const sync = async (name: VendorName, root: string) => {
  const vendor = vendors[name];
  const prefixExists = existsSync(`${root}/${vendor.prefix}`);
  const existingSplit = await subtreeSplit(vendor, root);

  if (prefixExists && existingSplit === undefined) {
    throw new Error(
      `${vendor.prefix} exists without git subtree metadata. Remove the copied directory in a clean commit before retrying.`,
    );
  }

  const remoteCommit = await resolveRemoteCommit(vendor, root);
  await fetchRemoteCommit(vendor, remoteCommit, root);

  const operation = prefixExists ? 'merge' : 'add';
  console.log(
    `${operation === 'add' ? 'Adding' : 'Syncing'} ${name} from ${vendor.repository}#${vendor.ref}`,
  );

  const exitCode = await run(
    ['git', 'subtree', operation, `--prefix=${vendor.prefix}`, remoteCommit, '--squash'],
    root,
  );

  if (exitCode !== 0) {
    throw new Error(
      `Could not ${operation} ${name}. Confirm git-subtree is installed and resolve the Git state before retrying.`,
    );
  }

  const syncedSplit = await subtreeSplit(vendor, root);
  if (syncedSplit !== remoteCommit) {
    throw new Error(
      `The ${name} subtree recorded ${syncedSplit ?? 'no split commit'} instead of ${remoteCommit}.`,
    );
  }

  await assertNoGitlinks(vendor, root);

  const missingPaths = vendor.requiredPaths.filter(
    (path) => !existsSync(`${root}/${vendor.prefix}/${path}`),
  );
  if (missingPaths.length > 0) {
    throw new Error(`The ${name} subtree is missing required paths:\n${missingPaths.join('\n')}`);
  }
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
