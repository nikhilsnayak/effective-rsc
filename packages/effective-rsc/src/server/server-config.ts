import { Context } from 'effect';

export const DefaultApplicationPort = 18193;
export const DefaultApplicationHostname = 'localhost';

// Zero disables Bun's idle timeout, which would otherwise cut a stalled Suspense boundary off at
// ten seconds. Connection deadlines belong to the deployment's proxy.
export const ApplicationIdleTimeoutSeconds = 0;

// Bun rejects oversized bodies before they reach the framework router or React's Server Function
// decoder.
export const ApplicationMaxRequestBodySizeBytes = 10 * 1024 * 1024;

export class ServerConfig extends Context.Service<
  ServerConfig,
  {
    readonly clientAssetsCacheControl: string;
    readonly clientAssetsRoot: string;
    readonly clientBootstrapScripts: ReadonlyArray<string>;
    readonly clientStylesheets: ReadonlyArray<string>;
    readonly hostname: string;
    readonly port: number;
    readonly publicAssetsRoot: string;
  }
>()('ersc/server/server-config/ServerConfig') {}
