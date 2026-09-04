// Adapted from rsc-html-stream by Devon Govett.
// Copyright (c) 2024-present Devon Govett. Licensed under the MIT License; see vendor/rsc-html-stream/LICENSE.
import { Context, Effect, Layer } from 'effect';

const Encoder = new TextEncoder();

export type EmbeddedFlightChunk = string | Uint8Array;
type EmbeddedFlightQueue = Array<EmbeddedFlightChunk>;
type FlightWindow = Window & { __FLIGHT_DATA?: EmbeddedFlightQueue };

export const makeInitialFlightStream = (
  queue: EmbeddedFlightQueue,
  closeWhenReady: (close: () => void) => void,
) => {
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueue = (chunk: EmbeddedFlightChunk) => {
        controller.enqueue(typeof chunk === 'string' ? Encoder.encode(chunk) : chunk);
      };
      for (const chunk of queue) {
        enqueue(chunk);
      }
      queue.length = 0;
      queue.push = (...chunks) => {
        for (const chunk of chunks) {
          enqueue(chunk);
        }
        return 0;
      };
      streamController = controller;
    },
  });
  closeWhenReady(() => streamController?.close());
  return stream;
};

const makeBrowserInitialFlightStream = () => {
  const flightWindow = window as FlightWindow;
  const queue = (flightWindow.__FLIGHT_DATA ??= []);
  return makeInitialFlightStream(queue, (close) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', close, { once: true });
    } else {
      close();
    }
  });
};

const makeServerInitialFlightStream = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close();
    },
  });

export class InitialFlightStream extends Context.Service<InitialFlightStream>()(
  'ersc/client/initial-flight-stream/InitialFlightStream',
  {
    make: Effect.sync(() => ({
      stream:
        typeof window === 'undefined'
          ? makeServerInitialFlightStream()
          : makeBrowserInitialFlightStream(),
    })),
  },
) {
  static readonly layer = Layer.effect(this, this.make);

  static readonly layerTest = Layer.mock(this);
}
