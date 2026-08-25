export const ClientOutputDir = '.ersc/client';
export const ServerOutputDir = '.ersc/server';

export const ClientEntryName = 'main';
export const ServerEntryName = 'main';

export const CssFilenameTemplate = '[name].css';
export const JsFilenameTemplate = '[name].js';

const emittedJsFile = (entryName: string) => JsFilenameTemplate.replace('[name]', entryName);

export const ServerBundlePath = `${ServerOutputDir}/${emittedJsFile(ServerEntryName)}`;
