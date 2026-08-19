import { AppRpcs } from '@repo/contracts/AppRpcs';
import { Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { AtomRpc } from 'effect/unstable/reactivity';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';

import { serverUrlAtom } from './Config.ts';

export class AppRpcClient extends AtomRpc.Service<AppRpcClient>()(
  '@repo/client-runtime/AppRpcClient',
  {
    group: AppRpcs,
    protocol: (get) =>
      RpcClient.layerProtocolHttp({ url: `${get(serverUrlAtom)}/rpc` }).pipe(
        Layer.provideMerge(RpcSerialization.layerNdjson),
        Layer.provideMerge(FetchHttpClient.layer),
      ),
  },
) {}
