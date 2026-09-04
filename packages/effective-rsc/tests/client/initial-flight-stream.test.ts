// Adapted from the rsc-html-stream test suite by Devon Govett.
// Copyright (c) 2024-present Devon Govett. Licensed under the MIT License; see vendor/rsc-html-stream/LICENSE.
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import {
  type EmbeddedFlightChunk,
  makeInitialFlightStream,
} from '../../src/client/initial-flight-stream';

describe('makeInitialFlightStream', () => {
  it.effect(
    'drains embedded chunks, accepts later scripts, and closes when the document is ready',
    () =>
      Effect.gen(function* () {
        const queue: Array<EmbeddedFlightChunk> = ['initial', new Uint8Array([0, 255])];
        let markReady: (() => void) | undefined;
        const reader = makeInitialFlightStream(queue, (close) => {
          markReady = close;
        }).getReader();

        const initialText = yield* Effect.promise(() => reader.read());
        expect(initialText).toEqual({
          done: false,
          value: new TextEncoder().encode('initial'),
        });
        const initialBinary = yield* Effect.promise(() => reader.read());
        expect(initialBinary).toEqual({
          done: false,
          value: new Uint8Array([0, 255]),
        });
        expect(queue).toHaveLength(0);

        queue.push('later');
        const later = yield* Effect.promise(() => reader.read());
        expect(later).toEqual({
          done: false,
          value: new TextEncoder().encode('later'),
        });

        markReady?.();
        const done = yield* Effect.promise(() => reader.read());
        expect(done).toEqual({
          done: true,
          value: undefined,
        });
      }),
  );
});
