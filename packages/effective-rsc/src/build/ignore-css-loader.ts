import type { PitchLoaderDefinitionFunction } from '@rspack/core';

/**
 * Empties CSS in the server graph, where the module exists for stylesheet ordering and the browser
 * compilation owns every stylesheet asset. Pitching skips the rest of the chain, so Tailwind CSS
 * never scans the application twice per build.
 */
export const pitch: PitchLoaderDefinitionFunction = function () {
  return '';
};
