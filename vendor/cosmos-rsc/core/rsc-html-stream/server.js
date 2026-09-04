// https://github.com/devongovett/rsc-html-stream/blob/main/server.js

const { Transform } = require('stream');
const { TextEncoder, TextDecoder } = require('util');

const encoder = new TextEncoder();
const trailer = '</body></html>';

function injectRSCPayload(rscStream) {
  let decoder = new TextDecoder();
  let resolveFlightDataPromise;
  let flightDataPromise = new Promise(
    (resolve) => (resolveFlightDataPromise = resolve)
  );
  let startedRSC = false;
  let buffered = [];
  let timeout = null;

  function flushBufferedChunks(transform) {
    for (let chunk of buffered) {
      let buf = decoder.decode(chunk, { stream: true });
      if (buf.endsWith(trailer)) {
        buf = buf.slice(0, -trailer.length);
      }
      transform.push(encoder.encode(buf));
    }

    let remaining = decoder.decode();
    if (remaining.length) {
      if (remaining.endsWith(trailer)) {
        remaining = remaining.slice(0, -trailer.length);
      }
      transform.push(encoder.encode(remaining));
    }

    buffered.length = 0;
    timeout = null;
  }

  const transform = new Transform({
    transform(chunk, encoding, callback) {
      buffered.push(chunk);
      if (timeout) {
        callback();
        return;
      }

      timeout = setTimeout(async () => {
        flushBufferedChunks(transform);
        if (!startedRSC) {
          startedRSC = true;
          writeRSCStream(rscStream, transform)
            .catch((err) => transform.destroy(err))
            .then(resolveFlightDataPromise);
        }
      }, 0);

      callback();
    },

    async flush(callback) {
      try {
        await flightDataPromise;
        if (timeout) {
          clearTimeout(timeout);
          flushBufferedChunks(transform);
        }
        this.push(encoder.encode(trailer));
        callback();
      } catch (err) {
        callback(err);
      }
    },
  });

  return transform;
}

async function writeRSCStream(rscStream, transform) {
  const decoder = new TextDecoder('utf-8', { fatal: true });

  for await (const chunk of rscStream) {
    try {
      // Try decoding the chunk to send as a string
      writeChunk(
        JSON.stringify(decoder.decode(chunk, { stream: true })),
        transform
      );
    } catch (err) {
      console.log({ err });

      // If decoding fails, write as base64
      const base64 = JSON.stringify(Buffer.from(chunk).toString('base64'));
      writeChunk(
        `Uint8Array.from(Buffer.from(${base64}, 'base64'))`,
        transform
      );
    }
  }

  const remaining = decoder.decode();
  if (remaining.length) {
    writeChunk(JSON.stringify(remaining), transform);
  }
}

function writeChunk(chunk, transform) {
  transform.push(
    encoder.encode(
      `<script>${escapeScript(
        `(self.__RSC_PAYLOAD||=[]).push(${chunk})`
      )}</script>`
    )
  );
}

function escapeScript(script) {
  return script.replace(/<!--/g, '<\\!--').replace(/<\/(script)/gi, '</\\$1');
}

module.exports = { injectRSCPayload };
