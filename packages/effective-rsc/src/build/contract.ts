export const ApplicationEntryPath = 'src/application.tsx';
export const ApplicationEntrySpecifier = 'effective-rsc/application-entry';

export const ClientEntryName = 'main';
export const ClientOutputDir = '.ersc/client';
export const PublicAssetsDir = 'public';
export const ServerEntryName = 'main';
export const ServerOutputDir = '.ersc/server';

export const CssFilenameTemplate = '[name].css';
export const JsFilenameTemplate = '[name].js';

export const CompiledServerExportNames: {
  readonly application: 'default';
  readonly httpLayer: 'HttpLayer';
  readonly serverLayer: 'ServerLayer';
} = {
  application: 'default',
  httpLayer: 'HttpLayer',
  serverLayer: 'ServerLayer',
};

const emittedJsFile = (entryName: string) => JsFilenameTemplate.replace('[name]', entryName);

export const ServerBundlePath = `${ServerOutputDir}/${emittedJsFile(ServerEntryName)}`;
