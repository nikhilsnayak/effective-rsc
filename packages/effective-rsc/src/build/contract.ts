export const ApplicationEntryPath = 'src/application.tsx';
export const ApplicationEntrySpecifier = 'effective-rsc/application-entry';

export const ErscOutputDir = '.ersc';
export const BuildClientOutputDir = `${ErscOutputDir}/client`;
export const BuildServerOutputDir = `${ErscOutputDir}/server`;
export const ClientEntryName = 'main';
export const DevOutputDir = `${ErscOutputDir}/dev`;
export const DevClientOutputDir = `${DevOutputDir}/client`;
export const DevServerOutputDir = `${DevOutputDir}/server`;
export const PublicAssetsDir = 'public';
export const ServerEntryName = 'main';

export const BuildCssFilenameTemplate = '[name].css';
export const BuildJsFilenameTemplate = '[name].js';
export const DevCssFilenameTemplate = '[name].[contenthash].css';
export const DevJsFilenameTemplate = '[name].[contenthash].js';

export const CompiledServerExportNames: {
  readonly application: 'default';
  readonly httpLayer: 'HttpLayer';
  readonly serverLayer: 'ServerLayer';
} = {
  application: 'default',
  httpLayer: 'HttpLayer',
  serverLayer: 'ServerLayer',
};

const emittedBuildJsFile = (entryName: string) =>
  BuildJsFilenameTemplate.replace('[name]', entryName);

export const BuildServerBundlePath = `${BuildServerOutputDir}/${emittedBuildJsFile(ServerEntryName)}`;
