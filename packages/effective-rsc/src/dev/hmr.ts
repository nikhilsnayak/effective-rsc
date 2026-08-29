import { Schema } from 'effect';

export const DevHmrPath = '/_ersc/hmr';

const ClientUpdate = Schema.TaggedStruct('ClientUpdate', { clientHash: Schema.String });

const RscUpdate = Schema.TaggedStruct('RscUpdate', { clientHash: Schema.String });

export const DevHmrMessage = Schema.Union([ClientUpdate, RscUpdate]);
export type DevHmrMessage = typeof DevHmrMessage.Type;

export const DevHmrMessageJson = Schema.fromJsonString(DevHmrMessage);
