const path = require('path');

const BUILD_DIR = path.resolve(__dirname, '../../../.cosmos-rsc');
const FAVICON_PATH = path.resolve(__dirname, '../../../app/favicon.ico');

const FIZZ_WORKER_PATH = path.resolve(__dirname, './fizz-worker.js');

const REACT_CLIENT_MANIFEST_PATH = path.join(
  BUILD_DIR,
  'react-client-manifest.json'
);

const REACT_SSR_MANIFEST_PATH = path.join(BUILD_DIR, 'react-ssr-manifest.json');

module.exports = {
  BUILD_DIR,
  FIZZ_WORKER_PATH,
  REACT_CLIENT_MANIFEST_PATH,
  REACT_SSR_MANIFEST_PATH,
  FAVICON_PATH,
};
