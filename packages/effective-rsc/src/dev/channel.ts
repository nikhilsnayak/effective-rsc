import { Schema } from 'effect';

export const DevChannelPath = '/_ersc/dev';

const ClientUpdate = Schema.TaggedStruct('ClientUpdate', { clientHash: Schema.String });

const RscUpdate = Schema.TaggedStruct('RscUpdate', { clientHash: Schema.String });

const BuildFailed = Schema.TaggedStruct('BuildFailed', { diagnostics: Schema.String });

export const DevChannelMessage = Schema.Union([ClientUpdate, RscUpdate, BuildFailed]);
export type DevChannelMessage = typeof DevChannelMessage.Type;

export const DevChannelMessageJson = Schema.fromJsonString(DevChannelMessage);
