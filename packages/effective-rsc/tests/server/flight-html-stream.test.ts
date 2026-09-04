// Adapted from the rsc-html-stream test suite by Devon Govett.
// Copyright (c) 2024-present Devon Govett. Licensed under the MIT License; see vendor/rsc-html-stream/LICENSE.
import { createContext, runInContext } from 'node:vm';

import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import {
  type EmbeddedFlightChunk,
  makeInitialFlightStream,
} from '../../src/client/initial-flight-stream';
import { injectFlightPayload } from '../../src/server/flight-html-stream';

const Encoder = new TextEncoder();

type SourceChunk = string | Uint8Array | (() => void | Promise<void>);

const streamFrom = (source: ReadonlyArray<SourceChunk>) => {
  const chunks = [...source];
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const drain = (): void | Promise<void> => {
        while (chunks.length > 0) {
          const chunk = chunks.shift();
          if (typeof chunk === 'function') {
            return Promise.resolve(chunk()).then(drain);
          }
          if (typeof chunk === 'string') {
            controller.enqueue(Encoder.encode(chunk));
          } else if (chunk !== undefined) {
            controller.enqueue(chunk);
          }
        }
        controller.close();
      };
      return drain();
    },
  });
};

const streamToBytes = (stream: ReadableStream<Uint8Array>) =>
  Effect.promise(() => Promise.resolve(Bun.readableStreamToBytes(stream)));

const streamToText = (stream: ReadableStream<Uint8Array>) =>
  streamToBytes(stream).pipe(Effect.map((bytes) => new TextDecoder().decode(bytes)));

const embeddedFlightQueue = (html: string, nonce?: string) => {
  const nonceAttribute = nonce === undefined ? '' : ` nonce="${nonce}"`;
  const scripts = html.matchAll(new RegExp(`<script${nonceAttribute}>(.*?)<\\/script>`, 'g'));
  const self: { __FLIGHT_DATA?: Array<EmbeddedFlightChunk> } = {};
  const context = createContext({ atob, self, Uint8Array });
  for (const script of scripts) {
    runInContext(script[1] ?? '', context);
  }
  return self.__FLIGHT_DATA ?? [];
};

const reconstructFlight = (html: string, nonce?: string) =>
  streamToBytes(makeInitialFlightStream(embeddedFlightQueue(html, nonce), (close) => close()));

describe('injectFlightPayload', () => {
  it.effect('embeds text chunks and reconstructs the original Flight bytes', () =>
    Effect.gen(function* () {
      const html = streamFrom(['<html><body><h1>Test</h1>', '<p>Hello world</p></body></html>']);
      const flight = streamFrom(['foo bar', 'baz qux', 'abcdef']);

      const result = yield* streamToText(html.pipeThrough(injectFlightPayload(flight)));

      expect(result).toBe(
        '<html><body><h1>Test</h1><p>Hello world</p>' +
          '<script>(self.__FLIGHT_DATA||=[]).push("foo bar")</script>' +
          '<script>(self.__FLIGHT_DATA||=[]).push("baz qux")</script>' +
          '<script>(self.__FLIGHT_DATA||=[]).push("abcdef")</script></body></html>',
      );
      const reconstructed = yield* reconstructFlight(result);
      expect(new TextDecoder().decode(reconstructed)).toBe('foo barbaz quxabcdef');
    }),
  );

  it.effect('uses base64 for invalid UTF-8 and reconstructs the original bytes', () =>
    Effect.gen(function* () {
      const binary = new Uint8Array([1, 2, 3, 4, 5, 0xe2, 0x28, 0xa1]);
      const html = streamFrom(['<html><body><h1>Test</h1></body></html>']);
      const flight = streamFrom(['foo bar', binary]);

      const result = yield* streamToText(html.pipeThrough(injectFlightPayload(flight)));

      expect(result).toContain(
        '<script>(self.__FLIGHT_DATA||=[]).push(' +
          'Uint8Array.from(atob("AQIDBAXiKKE="),character=>character.codePointAt(0)))</script>',
      );
      const reconstructed = yield* reconstructFlight(result);
      expect(reconstructed).toEqual(new Uint8Array([...Encoder.encode('foo bar'), ...binary]));
    }),
  );

  it.effect('interleaves Flight only between complete HTML batches', () =>
    Effect.gen(function* () {
      const continueFlight = Promise.withResolvers<void>();
      const html = streamFrom([
        '<html><body><h1>Test</h1>',
        () => Bun.sleep(3),
        '<p>Hello',
        () => continueFlight.resolve(),
        ' world</p></body></html>',
      ]);
      const flight = streamFrom(['foo bar', () => continueFlight.promise, 'baz qux', 'abcdef']);

      const result = yield* streamToText(html.pipeThrough(injectFlightPayload(flight)));

      expect(result).toBe(
        '<html><body><h1>Test</h1>' +
          '<script>(self.__FLIGHT_DATA||=[]).push("foo bar")</script>' +
          '<script>(self.__FLIGHT_DATA||=[]).push("baz qux")</script>' +
          '<script>(self.__FLIGHT_DATA||=[]).push("abcdef")</script>' +
          '<p>Hello world</p></body></html>',
      );
    }),
  );

  it.effect('adds a nonce to each embedded script', () =>
    Effect.gen(function* () {
      const html = streamFrom(['<html><body>Test</body></html>']);
      const flight = streamFrom(['foo bar']);

      const result = yield* streamToText(
        html.pipeThrough(injectFlightPayload(flight, { nonce: 'test' })),
      );

      expect(result).toBe(
        '<html><body>Test<script nonce="test">' +
          '(self.__FLIGHT_DATA||=[]).push("foo bar")</script></body></html>',
      );
      const reconstructed = yield* reconstructFlight(result, 'test');
      expect(new TextDecoder().decode(reconstructed)).toBe('foo bar');
    }),
  );

  it.effect('does not split a multi-byte HTML character or a chunked closing trailer', () =>
    Effect.gen(function* () {
      const html = streamFrom([
        '<html><body><h1>Test</h1>',
        new Uint8Array([240]),
        new Uint8Array([159]),
        () => Promise.resolve(),
        new Uint8Array([153, 130]),
        '<p>Hello world</p></bo',
        'dy></html>',
      ]);
      const flight = streamFrom(['foo bar']);

      const result = yield* streamToText(html.pipeThrough(injectFlightPayload(flight)));

      expect(result).toBe(
        '<html><body><h1>Test</h1>🙂<p>Hello world</p>' +
          '<script>(self.__FLIGHT_DATA||=[]).push("foo bar")</script></body></html>',
      );
    }),
  );

  it.effect('escapes script endings and HTML comments in text chunks', () =>
    Effect.gen(function* () {
      const html = streamFrom(['<html><body>Test</body></html>']);
      const flight = streamFrom(['<!--</ScRiPt>']);

      const result = yield* streamToText(html.pipeThrough(injectFlightPayload(flight)));

      expect(result).toContain('<\\!--</\\ScRiPt>');
      const reconstructed = yield* reconstructFlight(result);
      expect(new TextDecoder().decode(reconstructed)).toBe('<!--</ScRiPt>');
    }),
  );

  it.effect('settles a concurrent read and cancellation without hanging', () =>
    Effect.gen(function* () {
      const html = streamFrom(['<html><body><h1>html</h1></body></html>']);
      const flight = streamFrom(['rsc']);
      const reader = html.pipeThrough(injectFlightPayload(flight)).getReader();

      const read = reader.read();
      yield* Effect.promise(() => Bun.sleep(0));
      const cancel = reader.cancel();
      const results = yield* Effect.promise(() => Promise.allSettled([read, cancel]));

      expect(results[0]?.status).toBe('fulfilled');
      expect(results[1]?.status).toBe('fulfilled');
    }),
  );
});
