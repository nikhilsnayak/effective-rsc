// Adapted from rsc-html-stream by Devon Govett.
// Copyright (c) 2024-present Devon Govett. Licensed under the MIT License; see repos/rsc-html-stream/LICENSE.
import { Context, Effect, Layer } from 'effect';

const Encoder = new TextEncoder();
const HtmlTrailer = Encoder.encode('</body></html>');
const EmptyBytes = new Uint8Array();

type StreamController = TransformStreamDefaultController<Uint8Array>;

export type FlightHtmlStreamOptions = {
  readonly nonce?: string;
};

const trailerPrefixLength = (bytes: Uint8Array) => {
  const maximumLength = Math.min(bytes.byteLength, HtmlTrailer.byteLength);
  for (let length = maximumLength; length > 0; length -= 1) {
    const offset = bytes.byteLength - length;
    let matches = true;
    for (let index = 0; index < length; index += 1) {
      if (bytes[offset + index] !== HtmlTrailer[index]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return length;
    }
  }
  return 0;
};

const escapeInlineScript = (script: string) =>
  script.replace(/<!--|<\/script/gi, (match) =>
    match === '<!--' ? '<\\!--' : `</\\${match.slice(2)}`,
  );

const writeFlightValue = (
  value: string,
  controller: StreamController,
  nonce: string | undefined,
) => {
  const script = escapeInlineScript(`(self.__FLIGHT_DATA||=[]).push(${value})`);
  const nonceAttribute = nonce === undefined ? '' : ` nonce="${nonce}"`;
  controller.enqueue(Encoder.encode(`<script${nonceAttribute}>${script}</script>`));
};

const writeFlightChunk = (
  decoder: TextDecoder,
  chunk: Uint8Array,
  controller: StreamController,
  nonce: string | undefined,
) => {
  try {
    const text = decoder.decode(chunk);
    if (text.length > 0) {
      writeFlightValue(JSON.stringify(text), controller, nonce);
    }
  } catch {
    const base64 = JSON.stringify(chunk.toBase64());
    writeFlightValue(
      `Uint8Array.from(atob(${base64}),character=>character.codePointAt(0))`,
      controller,
      nonce,
    );
  }
};

const writeFlightStream = (
  stream: ReadableStream<Uint8Array>,
  controller: StreamController,
  nonce: string | undefined,
): Promise<void> => {
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const reader = stream.getReader();
  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      reader.releaseLock();
    }
  };
  const cancel = (cause: unknown): Promise<never> => {
    let cancellation: Promise<void>;
    try {
      cancellation = reader.cancel(cause);
    } catch {
      release();
      return Promise.reject(cause);
    }
    return cancellation.then(
      () => {
        release();
        return Promise.reject(cause);
      },
      () => {
        release();
        return Promise.reject(cause);
      },
    );
  };
  const handle = (result: Bun.ReadableStreamDefaultReadManyResult<Uint8Array>): Promise<void> => {
    if (result.done) {
      release();
      return Promise.resolve();
    }
    try {
      for (const chunk of result.value) {
        writeFlightChunk(decoder, chunk, controller, nonce);
      }
    } catch (cause) {
      return cancel(cause);
    }
    return read();
  };
  const read = (): Promise<void> => {
    let result:
      | Bun.ReadableStreamDefaultReadManyResult<Uint8Array>
      | Promise<Bun.ReadableStreamDefaultReadManyResult<Uint8Array>>;
    try {
      result = reader.readMany();
    } catch (cause) {
      return cancel(cause);
    }
    return 'then' in result ? result.then(handle, cancel) : handle(result);
  };

  return read();
};

const makeHtmlWriter = () => {
  let tail = EmptyBytes;

  return {
    finish(controller: StreamController) {
      if (tail.byteLength !== HtmlTrailer.byteLength && tail.byteLength > 0) {
        controller.enqueue(tail);
      }
      controller.enqueue(HtmlTrailer);
    },
    write(chunks: ReadonlyArray<Uint8Array>, controller: StreamController) {
      if (chunks.length === 0) {
        return;
      }
      const byteLength = chunks.reduce((total, chunk) => total + chunk.byteLength, tail.byteLength);
      const combined = new Uint8Array(byteLength);
      combined.set(tail);
      let offset = tail.byteLength;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
      }

      const bodyLength = combined.byteLength - trailerPrefixLength(combined);
      if (bodyLength > 0) {
        controller.enqueue(combined.subarray(0, bodyLength));
      }
      tail = combined.slice(bodyLength);
    },
  };
};

export const injectFlightPayload = (
  flightStream: ReadableStream<Uint8Array>,
  options?: FlightHtmlStreamOptions,
) => {
  const htmlWriter = makeHtmlWriter();
  const bufferedHtml: Array<Uint8Array> = [];
  const flightCompletion = Promise.withResolvers<void>();
  let flightStarted = false;
  let flushScheduled = false;

  const fail = (controller: StreamController, cause: unknown) => {
    try {
      controller.error(cause);
    } finally {
      flightCompletion.resolve();
    }
  };
  const flushHtml = (controller: StreamController) => {
    htmlWriter.write(bufferedHtml, controller);
    bufferedHtml.length = 0;
  };
  const startFlight = (controller: StreamController) => {
    if (flightStarted) {
      return;
    }
    flightStarted = true;
    writeFlightStream(flightStream, controller, options?.nonce).then(
      flightCompletion.resolve,
      (cause: unknown) => fail(controller, cause),
    );
  };
  const flushAndStartFlight = (controller: StreamController) => {
    try {
      flushHtml(controller);
      startFlight(controller);
    } catch (cause) {
      fail(controller, cause);
    }
  };

  return new TransformStream<Uint8Array, Uint8Array>({
    flush(controller) {
      if (flushScheduled) {
        flushScheduled = false;
        flushHtml(controller);
      }
      startFlight(controller);
      return flightCompletion.promise.then(() => htmlWriter.finish(controller));
    },
    transform(chunk, controller) {
      bufferedHtml.push(chunk);
      if (!flushScheduled) {
        flushScheduled = true;
        void Bun.sleep(0).then(() => {
          if (flushScheduled) {
            flushScheduled = false;
            flushAndStartFlight(controller);
          }
        });
      }
    },
  });
};

export class FlightHtmlInjector extends Context.Service<FlightHtmlInjector>()(
  'ersc/server/flight-html-stream/FlightHtmlInjector',
  {
    make: Effect.succeed({ inject: injectFlightPayload }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);

  static readonly layerTest = Layer.mock(this);
}
