import { Schema } from 'effect';

export const DevChannelPath = '/_ersc/dev';

const ClientUpdate = Schema.TaggedStruct('ClientUpdate', { clientHash: Schema.String });

const RscUpdate = Schema.TaggedStruct('RscUpdate', { clientHash: Schema.String });

export const DevChannelMessage = Schema.Union([ClientUpdate, RscUpdate]);
export type DevChannelMessage = typeof DevChannelMessage.Type;

export const DevChannelMessageJson = Schema.fromJsonString(DevChannelMessage);
