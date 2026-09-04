require('react-server-dom-webpack/node-register')();
require('@babel/register')({
  ignore: [/[\\/](.cosmos-rsc|node_modules)[\\/]/],
  presets: [['@babel/preset-react', { runtime: 'automatic' }]],
  plugins: ['@babel/plugin-transform-modules-commonjs'],
});

const fs = require('fs');
const express = require('express');
const busboy = require('busboy');
const { createElement } = require('react');
const { fileURLToPath } = require('url');
const { MessageChannel, Worker } = require('worker_threads');
const { PassThrough, Readable } = require('stream');
const {
  renderToPipeableStream,
  decodeReplyFromBusboy,
  decodeAction,
  decodeFormState,
} = require('react-server-dom-webpack/server');
const { getReactClientManifest } = require('./lib/manifests');
const { runWithAppStore, getAppStore } = require('./lib/app-store');
const { getCookieString } = require('./lib/utils');
const {
  BUILD_DIR,
  FIZZ_WORKER_PATH,
  FAVICON_PATH,
} = require('./lib/constants');
const logger = require('./lib/logger');
const { Slot } = require('../client/components/slot-context');
const RootLayout = require('../../app/root-layout').default;

const PORT = 8000;
const app = express();

const fizzWorker = new Worker(FIZZ_WORKER_PATH, {
  execArgv: ['--conditions', 'default'],
});

app.use(express.static(BUILD_DIR));

async function requestHandler(req, res) {
  try {
    const incomingCookies = new Map(
      req.headers.cookie?.split(';').map((cookie) => {
        const [key, ...valueParts] = cookie.split('=');
        return [
          key.trim(),
          {
            value: valueParts.join('=').trim(),
          },
        ];
      }) ?? []
    );

    const appStore = {
      metadata: {
        renderPhase: 'START',
      },
      cookies: {
        incoming: incomingCookies,
        outgoing: new Map(),
      },
    };

    runWithAppStore(appStore, async () => {
      const { cookies, metadata } = getAppStore();

      let serverActionResult;
      let formState;
      if (req.method === 'POST') {
        metadata.renderPhase = 'SERVER_ACTION';

        const serverActionId = req.headers['server-action-id'];
        if (serverActionId) {
          const bb = busboy({ headers: req.headers });
          req.pipe(bb);
          const [fileUrl, functionName] = serverActionId.split('#');
          const serverAction = require(fileURLToPath(fileUrl))[functionName];
          const args = await decodeReplyFromBusboy(bb);
          serverActionResult = await serverAction.apply(null, args);
        } else {
          const fakeReq = new Request('http://localhost', {
            method: 'POST',
            headers: { 'Content-Type': req.headers['content-type'] },
            body: Readable.toWeb(req),
            duplex: 'half',
          });
          const formData = await fakeReq.formData();
          const action = await decodeAction(formData);
          const result = await action();
          formState = await decodeFormState(result, formData);
        }
      }

      metadata.renderPhase = 'RSC';

      if (cookies.outgoing.size > 0) {
        const cookieString = getCookieString([
          ...Array.from(cookies.incoming),
          ...Array.from(cookies.outgoing),
        ]);
        res.setHeader('Set-Cookie', cookieString);
      }

      const pagePath = `../../app/pages${req.path}`;
      let Page;

      try {
        Page = require(pagePath).default;
      } catch (error) {
        logger.error(`Failed to import page: ${pagePath}`, error);
        res.status(500).send('Internal Server Error');
        return;
      }

      if (!Page) {
        throw new Error(`No default export found in ${pagePath}`);
      }

      const tree = createElement(Page, { searchParams: { ...req.query } });

      let rootLayout;

      if (req.headers.accept !== 'text/x-component') {
        rootLayout = createElement(RootLayout, null, createElement(Slot));
      }

      const webpackMap = await getReactClientManifest();
      const payload = {
        rootLayout,
        tree,
        serverActionResult,
        formState,
      };
      const rscStream = renderToPipeableStream(payload, webpackMap, {
        onError: (error) => {
          console.error('Render error:', error);
          res.end();
        },
      });

      if (req.headers.accept === 'text/x-component') {
        res.setHeader('Content-Type', 'text/x-component');
        rscStream.pipe(res);
        return;
      }

      res.setHeader('Content-Type', 'text/html');

      const passThroughRSCStream = new PassThrough();
      rscStream.pipe(passThroughRSCStream);

      const { port1, port2 } = new MessageChannel();

      const request = {
        port: port2,
      };

      fizzWorker.postMessage(request, [port2]);

      passThroughRSCStream.on('data', (data) => {
        port1.postMessage({
          type: 'data',
          data,
        });
      });

      passThroughRSCStream.on('end', () => {
        port1.postMessage({
          type: 'end',
        });
      });

      port1.on('message', (message) => {
        if (message.type === 'data') {
          res.write(message.data);
        } else if (message.type === 'end') {
          res.end();
        }
      });
    });
  } catch (error) {
    logger.error(error);
    res.status(500).send('Internal Server Error');
  }
}

app.get('*splat', async (req, res) => {
  if (req.path === '/favicon.ico') {
    if (fs.existsSync(FAVICON_PATH)) {
      res.sendFile(FAVICON_PATH);
    } else {
      res.status(404).end();
    }
    return;
  }
  if (req.path === '/.well-known/appspecific/com.chrome.devtools.json') {
    res.status(404).end();
    return;
  }
  await requestHandler(req, res);
});

app.post('*splat', requestHandler);

app.listen(PORT, () => {
  logger.info(`Server is running on http://localhost:${PORT}`);
});
