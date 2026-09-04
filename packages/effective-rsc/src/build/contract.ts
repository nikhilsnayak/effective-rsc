export const ApplicationEntryPath = 'src/application.tsx';
export const ApplicationEntrySpecifier = 'effective-rsc/application-entry';

export const ErscOutputDir = '.ersc';
export const ClientEntryName = 'main';
export const DevOutputDir = `${ErscOutputDir}/dev`;
export const PublicAssetsDir = 'public';
export const ServerEntryName = 'main';

export type Environment = 'development' | 'production';

export type EnvironmentConfig = {
  readonly clientAssetsCacheControl: string;
  readonly clientCssFilename: string;
  readonly clientJsFilename: string;
  readonly clientOutputDir: string;
  readonly serverJsFilename: string;
  readonly serverOutputDir: string;
};

// A client asset name changes whenever its bytes change, so a client may keep it forever, and
// `ersc start` resolves the server bundle by path, so that one is named once.
const production: EnvironmentConfig = {
  clientAssetsCacheControl: 'public, max-age=31536000, immutable',
  clientCssFilename: '[name].[contenthash].css',
  clientJsFilename: '[name].[contenthash].js',
  clientOutputDir: `${ErscOutputDir}/client`,
  serverJsFilename: '[name].js',
  serverOutputDir: `${ErscOutputDir}/server`,
};

// Development keeps its own output directory, stores nothing across rebuilds, and reimports the
// server bundle every generation, where a repeated specifier would resolve to the module already
// in the registry.
const development: EnvironmentConfig = {
  ...production,
  clientAssetsCacheControl: 'no-store',
  clientOutputDir: `${DevOutputDir}/client`,
  serverJsFilename: '[name].[contenthash].js',
  serverOutputDir: `${DevOutputDir}/server`,
};

export const EnvironmentConfig: Record<Environment, EnvironmentConfig> = {
  development,
  production,
};

export const CompiledServerExportNames: {
  readonly application: 'default';
  readonly httpLayer: 'HttpLayer';
  readonly serverLayer: 'ServerLayer';
} = {
  application: 'default',
  httpLayer: 'HttpLayer',
  serverLayer: 'ServerLayer',
};

export const BuildServerBundlePath = `${production.serverOutputDir}/${production.serverJsFilename.replace('[name]', ServerEntryName)}`;
