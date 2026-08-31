import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

export const DevChannelPath = '/_ersc/dev';

const ClientUpdate = Schema.TaggedStruct('ClientUpdate', { clientHash: Schema.String });

const RscUpdate = Schema.TaggedStruct('RscUpdate', { clientHash: Schema.String });

const BuildFailed = Schema.TaggedStruct('BuildFailed', { diagnostics: Schema.String });

export const DevUpdate = Schema.Union([ClientUpdate, RscUpdate, BuildFailed]);
export type DevUpdate = typeof DevUpdate.Type;

export const DevRpcs = RpcGroup.make(
  Rpc.make('ObserveDevUpdates', {
    success: DevUpdate,
    stream: true,
  }),
);
