// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based browser-test boundary.
import { expect, test, type CDPSession } from '@playwright/test';

type TraceEvent = {
  readonly args?: unknown;
  readonly id?: string;
  readonly id2?: { readonly local?: string };
  readonly name: string;
  readonly ph: string;
  readonly ts: number;
};

type ServerComponentSpan = {
  readonly duration: number;
  readonly name: string;
};

const traceId = (event: TraceEvent) => event.id2?.local ?? event.id;

const startTracing = (session: CDPSession) =>
  session.send('Tracing.start', {
    categories: '-*,devtools.timeline,blink.user_timing',
    transferMode: 'ReturnAsStream',
  });

const stopTracing = async (session: CDPSession): Promise<ReadonlyArray<TraceEvent>> => {
  const tracingComplete = Promise.withResolvers<string>();
  session.once('Tracing.tracingComplete', ({ stream }) => {
    if (stream === undefined) {
      tracingComplete.reject(new Error('Trace stream is missing.'));
      return;
    }
    tracingComplete.resolve(stream);
  });
  await session.send('Tracing.end');
  const handle = await tracingComplete.promise;
  const chunks: Array<string> = [];
  for (;;) {
    const chunk = await session.send('IO.read', { handle });
    chunks.push(chunk.data);
    if (chunk.eof) {
      break;
    }
  }
  await session.send('IO.close', { handle });

  return (JSON.parse(chunks.join('')) as { readonly traceEvents: ReadonlyArray<TraceEvent> })
    .traceEvents;
};

const stopTracingAndCollectServerComponentSpans = async (
  session: CDPSession,
): Promise<ReadonlyArray<ServerComponentSpan>> => {
  const events = await stopTracing(session);
  const ends = new Map(
    events.filter((event) => event.ph === 'e').map((event) => [traceId(event), event]),
  );

  return events
    .filter((event) => event.ph === 'b' && JSON.stringify(event.args).includes('Server Components'))
    .map((event) => ({
      duration: ((ends.get(traceId(event))?.ts ?? event.ts) - event.ts) / 1_000,
      name: event.name.replaceAll('\u200b', ''),
    }));
};

test('emits React Server Components performance tracks across navigation', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'dev', 'React development instrumentation is dev-only.');
  const session = await page.context().newCDPSession(page);

  await startTracing(session);
  await page.goto('/schedule/saturday');
  await expect(page.getByRole('heading', { level: 1, name: 'Saturday schedule' })).toBeVisible();
  await page.waitForTimeout(1_000);
  const initialSpans = await stopTracingAndCollectServerComponentSpans(session);

  await startTracing(session);
  await page.getByRole('link', { name: 'See Sunday' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sunday schedule' })).toBeVisible();
  await page.waitForTimeout(1_000);
  const navigationSpans = await stopTracingAndCollectServerComponentSpans(session);

  expect(initialSpans.length).toBeGreaterThan(0);
  expect(navigationSpans.length).toBeGreaterThan(0);
  expect(navigationSpans.some(({ duration }) => duration >= 1_500)).toBe(true);
});
