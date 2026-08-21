import { Context } from 'effect';

export const DefaultApplicationPort = 18193;

export class ServerConfig extends Context.Service<
  ServerConfig,
  {
    readonly clientAssetsRoot: string;
    readonly clientBootstrapScripts: ReadonlyArray<string>;
    readonly clientStylesheets: ReadonlyArray<string>;
    readonly hostname: string;
    readonly port: number;
  }
>()('effective-rsc/server/server-config/ServerConfig') {}
