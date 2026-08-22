// oxlint-disable-next-line effecttsgo/node-builtin-import -- Vitest owns this Node test-orchestration boundary; the application process still runs under Bun.
import { spawn, type ChildProcess } from 'node:child_process';
// oxlint-disable-next-line effecttsgo/node-builtin-import -- The regression asserts that the compiler leaves no generated source entry on disk.
import { access } from 'node:fs/promises';
// oxlint-disable-next-line effecttsgo/node-builtin-import -- The integration fixture must reserve the framework's fixed application port before spawning Bun.
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, layer } from '@effect/vitest';
import { Context, Effect, Layer, Schema, Stream } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/unstable/http';

class IntegrationError extends Schema.TaggedError<IntegrationError>()('IntegrationError', {
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

const applicationPort = 18193;
const applicationRoot = fileURLToPath(new URL('../', import.meta.url));
const cliPath = fileURLToPath(new URL('../node_modules/.bin/ersc', import.meta.url));
const generatedEntryPath = fileURLToPath(new URL('../.ersc/entries/rsc.ts', import.meta.url));
const serverUrl = `http://localhost:${applicationPort}`;

const requestText = Effect.fnUntraced(function* (
  url: string,
  headers?: Readonly<Record<string, string>>,
) {
  const response = yield* HttpClient.get(url, { headers });
  const body = yield* response.text;

  return { body, response } as const;
});

const readRenderTimestamp = (html: string, attribute: string) => {
  const value = html.match(new RegExp(`${attribute}="(\\d+)"`))?.[1];
  if (value === undefined) {
    throw new Error(`Expected rendered HTML to contain ${attribute}.`);
  }

  return Number(value);
};

const assertApplicationPortAvailable = Effect.callback<void, IntegrationError>((resume) => {
  const probe = createServer();
  const onError = (cause: Error) =>
    resume(
      Effect.fail(
        new IntegrationError({
          message: `Port ${applicationPort} is already occupied; the integration test must own its server.`,
          cause,
        }),
      ),
    );

  probe.once('error', onError);
  probe.listen(applicationPort, 'localhost', () => {
    probe.off('error', onError);
    probe.close((cause) => {
      if (cause) {
        resume(
          Effect.fail(
            new IntegrationError({
              message: `Failed to release the integration test's port ${applicationPort} probe.`,
              cause,
            }),
          ),
        );
      } else {
        resume(Effect.void);
      }
    });
  });

  return Effect.sync(() => {
    probe.off('error', onError);
    if (probe.listening) {
      probe.close();
    }
  });
});

type ApplicationProcess = {
  readonly child: ChildProcess;
  readonly output: () => string;
  readonly spawnError: () => unknown;
};

const hasExited = ({ child }: ApplicationProcess) =>
  child.exitCode !== null || child.signalCode !== null;

const waitForApplicationExit = ({ child, spawnError }: ApplicationProcess) =>
  Effect.callback<number | null, IntegrationError>((resume) => {
    let completed = false;
    const cleanup = () => {
      child.off('error', onError);
      child.off('exit', onExit);
    };
    const complete = (effect: Effect.Effect<number | null, IntegrationError>) => {
      if (completed) {
        return;
      }
      completed = true;
      cleanup();
      resume(effect);
    };
    const onError = (cause: unknown) =>
      complete(
        Effect.fail(
          new IntegrationError({
            message: 'Failed to launch the application process.',
            cause,
          }),
        ),
      );
    const onExit = (code: number | null) => complete(Effect.succeed(code));

    child.once('error', onError);
    child.once('exit', onExit);

    const initialSpawnError = spawnError();
    if (initialSpawnError !== undefined) {
      onError(initialSpawnError);
    } else if (child.exitCode !== null || child.signalCode !== null) {
      onExit(child.exitCode);
    }

    return Effect.sync(cleanup);
  });

const spawnApplication = (command: 'build' | 'dev' | 'start', captureOutput = false) =>
  Effect.try({
    try: () => {
      let output = '';
      let spawnError: unknown;
      const child = spawn('bun', [cliPath, command], {
        cwd: applicationRoot,
        stdio: ['ignore', captureOutput ? 'pipe' : 'inherit', captureOutput ? 'pipe' : 'inherit'],
      });

      child.once('error', (cause) => {
        spawnError = cause;
      });
      if (captureOutput) {
        child.stdout?.on('data', (chunk: Buffer) => {
          output += chunk.toString();
        });
        child.stderr?.on('data', (chunk: Buffer) => {
          output += chunk.toString();
        });
      }

      return {
        child,
        output: () => output,
        spawnError: () => spawnError,
      } satisfies ApplicationProcess;
    },
    catch: (cause) =>
      new IntegrationError({
        message: `Failed to launch ersc ${command}.`,
        cause,
      }),
  });

const stopApplication = Effect.fnUntraced(function* ({ child }: ApplicationProcess) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const killAndWait = (signal: NodeJS.Signals) =>
    Effect.callback<void>((resume) => {
      const onExit = () => resume(Effect.void);

      child.once('exit', onExit);
      if (!child.kill(signal)) {
        child.off('exit', onExit);
        resume(Effect.void);
      }

      return Effect.sync(() => {
        child.off('exit', onExit);
      });
    });

  yield* killAndWait('SIGINT').pipe(
    Effect.timeoutOrElse({
      duration: '2 seconds',
      orElse: () => killAndWait('SIGKILL'),
    }),
  );
});

const acquireApplication = (command: 'dev' | 'start', captureOutput = false) =>
  Effect.acquireRelease(spawnApplication(command, captureOutput), (process) =>
    stopApplication(process).pipe(Effect.orDie),
  );

const waitForServer = Effect.fnUntraced(function* (
  process: ApplicationProcess,
  command: 'dev' | 'start',
) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const spawnError = process.spawnError();
    if (spawnError !== undefined) {
      return yield* new IntegrationError({
        message: `Failed to launch ersc ${command}.`,
        cause: spawnError,
      });
    }
    if (hasExited(process)) {
      return yield* new IntegrationError({
        message: `ersc ${command} exited before becoming ready.`,
        cause: new Error(
          `Exit code: ${process.child.exitCode}; signal: ${process.child.signalCode}\n${process.output().trimEnd()}`,
        ),
      });
    }

    const ready = yield* HttpClient.get(serverUrl).pipe(
      Effect.flatMap((response) => Stream.runDrain(response.stream)),
      Effect.as(true),
      Effect.orElseSucceed(() => false),
    );

    if (ready && !hasExited(process)) {
      return;
    }

    yield* Effect.sleep('50 millis');
  }

  return yield* new IntegrationError({
    message: `Timed out waiting for ersc ${command}.`,
    cause: new Error(process.output().trimEnd()),
  });
});

const runBuild = Effect.scoped(
  Effect.gen(function* () {
    const process = yield* Effect.acquireRelease(spawnApplication('build', true), (process) =>
      stopApplication(process).pipe(Effect.orDie),
    );
    const exitCode = yield* waitForApplicationExit(process);

    if (exitCode !== 0) {
      return yield* new IntegrationError({
        message: 'ersc build failed.',
        cause: new Error(`Exit code: ${exitCode}\n${process.output().trimEnd()}`),
      });
    }
  }),
);

class ProductionFixture extends Context.Service<
  ProductionFixture,
  {
    readonly flight: string;
    readonly html: string;
  }
>()('effective-rsc/examples/kitchen-sink/tests/ProductionFixture') {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      yield* assertApplicationPortAvailable;
      const process = yield* acquireApplication('start');
      yield* waitForServer(process, 'start');

      const flightResponse = yield* requestText(serverUrl, {
        accept: 'text/x-component',
      }).pipe(Effect.timeout('3 seconds'));
      const htmlResponse = yield* requestText(serverUrl);

      return ProductionFixture.of({
        flight: flightResponse.body,
        html: htmlResponse.body,
      });
    }).pipe(Effect.provide(FetchHttpClient.layer)),
  );
}

const ProductionTestLayer = Layer.merge(ProductionFixture.layer, FetchHttpClient.layer);

describe.sequential('Rspack RSC integration', () => {
  layer(ProductionTestLayer, { excludeTestServices: true, timeout: '20 seconds' })(
    'production server',
    (it) => {
      it.effect('renders a Server Component through Bun', () =>
        Effect.gen(function* () {
          const { flight } = yield* ProductionFixture;

          expect(flight).toContain('Saturday schedule');
          expect(flight).toContain('Server Components from first principles');
          expect(flight).toContain('Your agenda');
          expect(flight).toContain('"formState":null');
          expect(flight).toContain('"root"');
          expect(flight).toContain('"html"');
          expect(flight).toContain('"body"');
        }),
      );

      it.effect('runs the independent conference queries concurrently', () =>
        Effect.gen(function* () {
          const { html } = yield* ProductionFixture;
          const latestStart = Math.max(
            readRenderTimestamp(html, 'data-conference-started-at'),
            readRenderTimestamp(html, 'data-schedule-started-at'),
            readRenderTimestamp(html, 'data-navigation-started-at'),
            readRenderTimestamp(html, 'data-agenda-started-at'),
          );
          const earliestCompletion = Math.min(
            readRenderTimestamp(html, 'data-conference-completed-at'),
            readRenderTimestamp(html, 'data-schedule-completed-at'),
            readRenderTimestamp(html, 'data-navigation-completed-at'),
            readRenderTimestamp(html, 'data-agenda-completed-at'),
          );

          expect(latestStart).toBeLessThan(earliestCompletion);
        }),
      );

      it.effect('serializes the route-tree Client Components as native Flight imports', () =>
        Effect.gen(function* () {
          const { flight } = yield* ProductionFixture;
          const importRows = flight
            .split('\n')
            .filter((row) => /^[0-9a-f]+:I/.test(row))
            .map((row) => JSON.parse(row.slice(row.indexOf(':I') + 2)) as unknown);
          const serializedImports = importRows.map((row) => JSON.stringify(row));

          expect(importRows.length).toBeGreaterThan(0);
          expect(serializedImports.some((row) => row.includes('RouteTree'))).toBe(true);
          expect(serializedImports.some((row) => row.includes('RouteOutlet'))).toBe(true);
        }),
      );

      it.effect('serves the Flight stream through Effect HTTP', () =>
        Effect.gen(function* () {
          const { body, response } = yield* requestText(serverUrl, {
            accept: 'text/x-component',
          });

          expect(response.status).toBe(200);
          expect(response.headers['content-type']).toBe('text/x-component;charset=utf-8');
          expect(body).toContain('Saturday schedule');
          expect(body).toContain('Server Components from first principles');
          expect(body).toContain('Your agenda');
          expect(body).toMatch(/^[0-9a-f]+:I/m);
        }),
      );

      it.effect('renders an additional static route through HTML and Flight', () =>
        Effect.gen(function* () {
          const [htmlResponse, flightResponse] = yield* Effect.all(
            [
              requestText(`${serverUrl}/schedule/day-two?source=integration`),
              requestText(`${serverUrl}/schedule/day-two`, { accept: 'text/x-component' }),
            ],
            { concurrency: 'unbounded' },
          );

          expect(htmlResponse.response.status).toBe(200);
          expect(htmlResponse.body).toContain('<title>Converge 2026 — Conference schedule</title>');
          expect(htmlResponse.body).toMatch(/<h1[^>]*>Sunday schedule<\/h1>/);
          expect(htmlResponse.body).toContain('Mutation protocols that compose');
          expect(htmlResponse.body).not.toMatch(/<h1[^>]*>Saturday schedule<\/h1>/);
          expect(flightResponse.response.status).toBe(200);
          expect(flightResponse.body).toContain('Sunday schedule');
          expect(flightResponse.body).toContain('"formState":null');
        }),
      );

      it.effect('returns the native HTTP router 404 for an unknown path', () =>
        Effect.gen(function* () {
          const [htmlResponse, flightResponse] = yield* Effect.all(
            [
              requestText(`${serverUrl}/missing`),
              requestText(`${serverUrl}/missing`, { accept: 'text/x-component' }),
            ],
            { concurrency: 'unbounded' },
          );

          expect(htmlResponse.response.status).toBe(404);
          expect(htmlResponse.body).toBe('');
          expect(flightResponse.response.status).toBe(404);
          expect(flightResponse.body).toBe('');
        }),
      );

      it.effect('serves streamed HTML for a document request', () =>
        Effect.gen(function* () {
          const { body, response } = yield* requestText(serverUrl);

          expect(response.status).toBe(200);
          expect(response.headers['content-type']).toBe('text/html;charset=utf-8');
          expect(body.startsWith('<!DOCTYPE html>')).toBe(true);
          expect(body).toMatch(/<html[^>]* lang="en"[^>]*>/);
          expect(body).toContain('<title>Converge 2026 — Conference schedule</title>');
          expect(body).toContain('Loading conference schedule...');
          expect(body).toMatch(/<h1[^>]*>Saturday schedule<\/h1>/);
          expect(body).toContain('Server Components from first principles');
          expect(body).toContain('data-slot="card"');
          expect(body).toContain('data-slot="badge"');
          expect(body).toContain('data-slot="button"');
          expect(body).toMatch(/<head><link rel="stylesheet" href="\/_ersc\/assets\/[^"]+\.css"/);
          expect(body).toContain('<script src="/_ersc/assets/main.js"');
          expect(body).toContain('self.__FLIGHT_DATA');
          expect(body).not.toContain('effective-rsc-root');
        }),
      );

      it.effect('serves the compiled Tailwind stylesheet', () =>
        Effect.gen(function* () {
          const { html } = yield* ProductionFixture;
          const stylesheet = html.match(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+\.css)"/)?.[1];

          expect(stylesheet).toBeDefined();
          const { body, response } = yield* requestText(`${serverUrl}${stylesheet}`);

          expect(response.status).toBe(200);
          expect(response.headers['content-type']).toContain('text/css');
          expect(body).toContain('.font-sans');
          expect(body).toContain('.text-3xl');
          expect(body).toContain('background-color');
        }),
      );

      it.effect('streams the root loading fallback before the suspended page', () =>
        Effect.gen(function* () {
          const response = yield* HttpClient.get(serverUrl);
          const observed = yield* response.stream.pipe(
            Stream.decodeText(),
            Stream.runFold(
              () => ({ found: false, prefix: '' }),
              (state, chunk) => {
                if (state.found) {
                  return state;
                }

                const prefix = state.prefix + chunk;
                return {
                  found:
                    prefix.includes('Loading conference schedule...') ||
                    /<h1[^>]*>Saturday schedule<\/h1>/.test(prefix),
                  prefix,
                };
              },
            ),
          );

          expect(observed.prefix).toContain('Loading conference schedule...');
          expect(observed.prefix).not.toMatch(/<h1[^>]*>Saturday schedule<\/h1>/);
        }),
      );

      it.effect('embeds a decodable native Flight payload in the document', () =>
        Effect.gen(function* () {
          const { html } = yield* ProductionFixture;
          const embeddedFlight = [
            ...html.matchAll(/\(self\.__FLIGHT_DATA\|\|=\[\]\)\.push\(("(?:[^"\\]|\\.)*")\)/g),
          ]
            .map((match) => JSON.parse(match[1] ?? 'null') as unknown)
            .filter((chunk): chunk is string => typeof chunk === 'string')
            .join('');

          expect(embeddedFlight).toContain('Saturday schedule');
          expect(embeddedFlight).toMatch(/^[0-9a-f]+:I/m);
        }),
      );

      it.effect('serves the browser bootstrap and referenced client chunk', () =>
        Effect.gen(function* () {
          const { flight, html } = yield* ProductionFixture;
          const clientChunk = flight.match(/"([^"]+\.js)"/)?.[1];
          const bootstrapScripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(
            (match) => match[1],
          );

          expect(clientChunk).toBeDefined();
          expect(bootstrapScripts).toContain('/_ersc/assets/main.js');
          expect(bootstrapScripts.length).toBeGreaterThan(1);
          const assetPaths = new Set([...bootstrapScripts, `/_ersc/assets/${clientChunk}`]);
          const responses = yield* Effect.all(
            [...assetPaths].map((assetPath) => requestText(`${serverUrl}${assetPath}`)),
            { concurrency: 'unbounded' },
          );

          for (const { body, response } of responses) {
            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toContain('text/javascript');
            expect(body.length).toBeGreaterThan(0);
          }
        }),
      );

      it.effect('decodes Flight and renders HTML in the SSR layer', () =>
        Effect.gen(function* () {
          const { html } = yield* ProductionFixture;

          expect(html).toContain('Loading conference schedule...');
          expect(html).toMatch(/<h1[^>]*>Saturday schedule<\/h1>/);
          expect(html).toContain('Server Components from first principles');
          expect(html).toContain('Your agenda');
        }),
      );
    },
  );

  it.live(
    'keeps the development server live while a separate production compiler builds the application',
    () =>
      Effect.gen(function* () {
        yield* assertApplicationPortAvailable;
        const devProcess = yield* acquireApplication('dev', true);
        yield* waitForServer(devProcess, 'dev');
        const generatedEntryExists = yield* Effect.tryPromise({
          try: () =>
            access(generatedEntryPath).then(
              () => true,
              (cause: NodeJS.ErrnoException) => {
                if (cause.code === 'ENOENT') {
                  return false;
                }
                throw cause;
              },
            ),
          catch: (cause) =>
            new IntegrationError({
              message: 'Failed to inspect the retired generated RSC entry.',
              cause,
            }),
        });

        expect(generatedEntryExists).toBe(false);
        yield* runBuild;
        yield* Effect.sleep('200 millis');

        expect(hasExited(devProcess)).toBe(false);
        expect(devProcess.output()).not.toContain('building removed .ersc/entries/rsc.ts');
        expect(devProcess.output()).not.toContain('Module not found');

        const [htmlResponse, flightResponse] = yield* Effect.all(
          [requestText(serverUrl), requestText(serverUrl, { accept: 'text/x-component' })],
          { concurrency: 'unbounded' },
        );

        expect(htmlResponse.response.status).toBe(200);
        expect(htmlResponse.body).toContain('Saturday schedule');
        expect(flightResponse.response.status).toBe(200);
        expect(flightResponse.body).toMatch(/^[0-9a-f]+:I/m);
      }).pipe(Effect.provide(FetchHttpClient.layer)),
    20_000,
  );
});
