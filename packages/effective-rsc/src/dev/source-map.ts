import { FrameworkDevSourceMapPath } from '../application/namespace';

export const findDevSourceMapURL = (fileName: string, environmentName: string) => {
  const url = new URL(FrameworkDevSourceMapPath, location.origin);
  url.searchParams.set('fileName', fileName);
  url.searchParams.set('environmentName', environmentName);
  return url.href;
};
