const { readFile } = require('fs/promises');
const { lazy } = require('./utils');
const {
  REACT_CLIENT_MANIFEST_PATH,
  REACT_SSR_MANIFEST_PATH,
} = require('./constants');

const reactClientManifest = lazy(async () => {
  try {
    const content = await readFile(REACT_CLIENT_MANIFEST_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `Client manifest not found at ${REACT_CLIENT_MANIFEST_PATH}`
      );
    }
    throw new Error(`Failed to parse client manifest: ${error.message}`);
  }
});

const reactSSRManifest = lazy(async () => {
  try {
    const content = await readFile(REACT_SSR_MANIFEST_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`SSR manifest not found at ${REACT_SSR_MANIFEST_PATH}`);
    }
    throw new Error(`Failed to parse SSR manifest: ${error.message}`);
  }
});

async function getReactClientManifest() {
  const manifest = await reactClientManifest.value;
  return manifest;
}

async function getReactSSRManifest() {
  const manifest = await reactSSRManifest.value;
  return manifest;
}

module.exports = { getReactClientManifest, getReactSSRManifest };
