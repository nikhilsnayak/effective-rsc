// https://github.com/devongovett/rsc-html-stream/blob/main/client.js

let streamController;
const encoder = new TextEncoder();

export const rscStream = new ReadableStream({
  start(controller) {
    let handleChunk = (chunk) => {
      if (typeof chunk === 'string') {
        controller.enqueue(encoder.encode(chunk));
      } else {
        controller.enqueue(chunk);
      }
    };
    window.__RSC_PAYLOAD ||= [];
    window.__RSC_PAYLOAD.forEach(handleChunk);
    window.__RSC_PAYLOAD.length = 0;
    window.__RSC_PAYLOAD.push = (chunk) => {
      handleChunk(chunk);
    };
    streamController = controller;
  },
});

const closeController = () => {
  if (streamController) {
    streamController.close();
    streamController = null;
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', closeController, {
    once: true,
  });
} else {
  closeController();
}
