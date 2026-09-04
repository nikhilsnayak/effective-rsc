import { beforeEach, expect, it, vi } from '@effect/vitest';
import { Effect, Fiber } from 'effect';
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http';

import { ServerFnIdHeader, type FlightPayload } from '../../src/rsc/flight';

const decodedPayload = {
  formState: null,
  routeTree: {
    child: null,
    content: null,
    id: 'root',
  },
  serverFnResult: null,
} satisfies FlightPayload;
const decodeFlight = vi.fn(
  (
    _stream: ReadableStream<Uint8Array>,
    _options?: { readonly startTime?: number; readonly temporaryReferences?: unknown },
  ) => Promise.resolve(decodedPayload),
);

vi.doMock('react-server-dom-rspack/client.browser', () => ({
  createFromReadableStream: decodeFlight,
}));

let initialFlightController: ReadableStreamDefaultController<Uint8Array> | undefined;
vi.doMock('rsc-html-stream/client', () => ({
  rscStream: new ReadableStream<Uint8Array>({
    start(controller) {
      initialFlightController = controller;
    },
  }),
}));

const { FlightClient, FlightLoadError } = await import('../../src/client/flight-client');
type FlightRequest = import('../../src/client/flight-client').FlightRequest;

const loadFlight = Effect.fnUntraced(function* (request: FlightRequest) {
  const client = yield* FlightClient;
  return yield* client.load(request);
}, Effect.provide(FlightClient.layer));

beforeEach(() => {
  decodeFlight.mockReset();
  decodeFlight.mockImplementation((_stream, _options) => Promise.resolve(decodedPayload));
});

const makeClient = (
  respond: (request: HttpClientRequest.HttpClientRequest, signal: AbortSignal) => Response,
) =>
  HttpClient.make((request, _url, signal) =>
    Effect.sync(() => HttpClientResponse.fromWeb(request, respond(request, signal))),
  );

const makePendingFlightResponse = (signal: AbortSignal) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
      },
    }),
    {
      headers: {
        'content-location': 'https://effective-rsc.test/schedule/day-two',
        'content-type': 'text/x-component',
      },
    },
  );

it.effect('loads the embedded initial Flight without waiting for stream completion', () =>
  Effect.gen(function* () {
    decodeFlight.mockImplementationOnce((stream) => {
      const reader = stream.getReader();
      return reader.read().then(() => {
        void reader.read();
        return decodedPayload;
      });
    });
    const client = yield* FlightClient;
    const loading = yield* client.loadInitial.pipe(Effect.forkChild);
    if (initialFlightController === undefined) {
      return yield* Effect.die('Expected the embedded Flight stream.');
    }
    initialFlightController.enqueue(new Uint8Array([1]));

    const resource = yield* Fiber.join(loading);
    const completion = yield* resource.completed.pipe(Effect.forkChild);
    yield* Effect.yieldNow;

    expect(resource.payload).toBe(decodedPayload);
    expect(completion.pollUnsafe()).toBeUndefined();

    initialFlightController.close();
    yield* Fiber.join(completion);
  }).pipe(
    Effect.provide(FlightClient.layer),
    Effect.provideService(
      HttpClient.HttpClient,
      HttpClient.make(() => Effect.die('Unexpected HTTP request.')),
    ),
  ),
);

it.effect('requests and decodes a whole-tree Flight response', () =>
  Effect.gen(function* () {
    let observedRequest: HttpClientRequest.HttpClientRequest | undefined;
    const client = makeClient((request) => {
      observedRequest = request;
      return new Response(new Uint8Array(), {
        headers: {
          'content-location': 'https://effective-rsc.test/schedule/day-two',
          'content-type': 'text/x-component;charset=utf-8',
        },
      });
    });

    const response = yield* loadFlight({
      _tag: 'Navigation',
      destination: new URL('https://effective-rsc.test/schedule/day-two'),
    }).pipe(Effect.provideService(HttpClient.HttpClient, client));
    if (response._tag === 'Document') {
      return yield* Effect.die('Expected a Flight response.');
    }

    expect(response.payload).toBe(decodedPayload);
    expect(response.resolvedUrl.href).toBe('https://effective-rsc.test/schedule/day-two');
    expect(observedRequest?.method).toBe('GET');
    expect(observedRequest?.url).toBe('https://effective-rsc.test/schedule/day-two');
    expect(observedRequest?.headers['accept']).toBe('text/x-component');
    expect(decodeFlight).toHaveBeenCalledWith(expect.any(ReadableStream), undefined);

    yield* response.release;
  }),
);

it.effect('keeps streamed chunks cancellable after the root payload resolves', () =>
  Effect.gen(function* () {
    const responseConsumptionStopped = Promise.withResolvers<void>();
    let requestSignal: AbortSignal | undefined;
    decodeFlight.mockImplementationOnce((stream) => {
      void stream
        .getReader()
        .read()
        .catch(() => responseConsumptionStopped.resolve());
      return Promise.resolve(decodedPayload);
    });
    const client = makeClient((_request, signal) => {
      requestSignal = signal;
      return makePendingFlightResponse(signal);
    });
    const response = yield* loadFlight({
      _tag: 'Navigation',
      destination: new URL('https://effective-rsc.test/schedule/day-two'),
    }).pipe(Effect.provideService(HttpClient.HttpClient, client));
    if (response._tag === 'Document') {
      return yield* Effect.die('Expected a Flight response.');
    }

    yield* response.release;
    yield* Effect.promise(() => responseConsumptionStopped.promise);

    expect(response.payload).toBe(decodedPayload);
    expect(requestSignal?.aborted).toBe(true);
  }),
);

it.effect('closes the response scope when the Flight stream reaches EOF', () =>
  Effect.gen(function* () {
    let requestSignal: AbortSignal | undefined;
    decodeFlight.mockImplementationOnce((stream) => {
      const reader = stream.getReader();
      return reader.read().then(() => decodedPayload);
    });
    const client = makeClient((_request, signal) => {
      requestSignal = signal;
      return new Response(new Uint8Array(), {
        headers: {
          'content-location': 'https://effective-rsc.test/schedule/day-two',
          'content-type': 'text/x-component',
        },
      });
    });

    const response = yield* loadFlight({
      _tag: 'Navigation',
      destination: new URL('https://effective-rsc.test/schedule/day-two'),
    }).pipe(Effect.provideService(HttpClient.HttpClient, client));
    if (response._tag === 'Document') {
      return yield* Effect.die('Expected a Flight response.');
    }

    expect(response.payload).toBe(decodedPayload);
    expect(requestSignal?.aborted).toBe(true);
  }),
);

it.effect('cancels an unfinished decoded stream when the browser scope closes', () =>
  Effect.gen(function* () {
    const responseConsumptionStopped = Promise.withResolvers<void>();
    let requestSignal: AbortSignal | undefined;
    decodeFlight.mockImplementationOnce((stream) => {
      void stream
        .getReader()
        .read()
        .catch(() => responseConsumptionStopped.resolve());
      return Promise.resolve(decodedPayload);
    });
    const client = makeClient((_request, signal) => {
      requestSignal = signal;
      return makePendingFlightResponse(signal);
    });

    yield* Effect.scoped(
      loadFlight({
        _tag: 'Navigation',
        destination: new URL('https://effective-rsc.test/schedule/day-two'),
      }).pipe(Effect.provideService(HttpClient.HttpClient, client)),
    );
    yield* Effect.promise(() => responseConsumptionStopped.promise);

    expect(requestSignal?.aborted).toBe(true);
  }),
);

it.effect('returns document navigation for a non-Flight navigation response', () =>
  Effect.gen(function* () {
    const resource = yield* loadFlight({
      _tag: 'Navigation',
      destination: new URL('https://effective-rsc.test/schedule/day-two'),
    }).pipe(
      Effect.provideService(
        HttpClient.HttpClient,
        makeClient(
          () =>
            new Response('<!doctype html>', {
              headers: { 'content-type': 'text/html;charset=utf-8' },
            }),
        ),
      ),
    );

    expect(resource._tag).toBe('Document');
    expect(decodeFlight).not.toHaveBeenCalled();
    yield* resource.release;
  }),
);

it.effect('rejects a Flight response without its resolved location', () =>
  loadFlight({
    _tag: 'Navigation',
    destination: new URL('https://effective-rsc.test/schedule/day-two'),
  }).pipe(
    Effect.provideService(
      HttpClient.HttpClient,
      makeClient(
        () =>
          new Response(new Uint8Array(), {
            headers: { 'content-type': 'text/x-component' },
          }),
      ),
    ),
    Effect.flip,
    Effect.map((error) => {
      expect(error).toBeInstanceOf(FlightLoadError);
      expect(error.reason).toBe('UnexpectedResponse');
      expect(decodeFlight).not.toHaveBeenCalled();
    }),
  ),
);

it.effect('releases the Flight transport when decoding fails', () =>
  Effect.gen(function* () {
    let requestSignal: AbortSignal | undefined;
    decodeFlight.mockRejectedValueOnce(new Error('invalid Flight payload'));
    const client = makeClient((_request, signal) => {
      requestSignal = signal;
      return makePendingFlightResponse(signal);
    });

    const error = yield* loadFlight({
      _tag: 'Navigation',
      destination: new URL('https://effective-rsc.test/schedule/day-two'),
    }).pipe(Effect.provideService(HttpClient.HttpClient, client), Effect.flip);

    expect(error).toBeInstanceOf(FlightLoadError);
    expect(error.reason).toBe('DecodeFailed');
    expect(requestSignal?.aborted).toBe(true);
  }),
);

it.effect('rejects a non-Flight Server Function response', () =>
  loadFlight({
    _tag: 'ServerFunction',
    body: 'encoded-arguments',
    destination: new URL('https://effective-rsc.test/'),
    id: 'server-function-id',
    temporaryReferences: {},
  }).pipe(
    Effect.provideService(
      HttpClient.HttpClient,
      makeClient(
        () =>
          new Response('Unauthorized', {
            status: 401,
          }),
      ),
    ),
    Effect.flip,
    Effect.map((error) => {
      expect(error).toBeInstanceOf(FlightLoadError);
      expect(error.reason).toBe('RequestFailed');
    }),
  ),
);

it.effect('decodes a Server Function response with its temporary references', () =>
  Effect.gen(function* () {
    const temporaryReferences = {};
    let observedRequest: HttpClientRequest.HttpClientRequest | undefined;
    const response = yield* loadFlight({
      _tag: 'ServerFunction',
      body: 'encoded-arguments',
      destination: new URL('https://effective-rsc.test/'),
      id: 'server-function-id',
      temporaryReferences,
    }).pipe(
      Effect.provideService(
        HttpClient.HttpClient,
        makeClient((request) => {
          observedRequest = request;
          return new Response(new Uint8Array(), {
            headers: {
              'content-location': 'https://effective-rsc.test/',
              'content-type': 'text/x-component',
            },
          });
        }),
      ),
    );

    expect(observedRequest?.method).toBe('POST');
    expect(observedRequest?.url).toBe('https://effective-rsc.test/');
    expect(observedRequest?.headers['accept']).toBe('text/x-component');
    expect(observedRequest?.headers[ServerFnIdHeader]).toBe('server-function-id');
    expect(decodeFlight).toHaveBeenCalledWith(expect.any(ReadableStream), {
      temporaryReferences,
    });

    yield* response.release;
  }),
);

it.effect('cancels Flight response consumption when loading is interrupted', () =>
  Effect.gen(function* () {
    const decodingStarted = Promise.withResolvers<void>();
    const responseConsumptionStopped = Promise.withResolvers<void>();
    let requestSignal: AbortSignal | undefined;
    decodeFlight.mockImplementationOnce((stream) => {
      decodingStarted.resolve();
      return stream
        .getReader()
        .read()
        .then(() => decodedPayload)
        .catch((cause) => {
          responseConsumptionStopped.resolve();
          throw cause;
        });
    });
    const client = makeClient((_request, signal) => {
      requestSignal = signal;
      return makePendingFlightResponse(signal);
    });
    const loadingFiber = yield* loadFlight({
      _tag: 'Navigation',
      destination: new URL('https://effective-rsc.test/schedule/day-two'),
    }).pipe(Effect.provideService(HttpClient.HttpClient, client), Effect.forkChild);

    yield* Effect.promise(() => decodingStarted.promise);
    yield* Fiber.interrupt(loadingFiber);
    yield* Effect.promise(() => responseConsumptionStopped.promise);

    expect(requestSignal?.aborted).toBe(true);
  }),
);
