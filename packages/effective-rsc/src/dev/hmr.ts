import { Schema } from 'effect';

const ClientUpdate = Schema.Struct({
  _tag: Schema.Literal('ClientUpdate'),
  clientHash: Schema.String,
});

const RscUpdate = Schema.Struct({
  _tag: Schema.Literal('RscUpdate'),
  clientHash: Schema.String,
});

export const DevHmrMessage = Schema.Union([ClientUpdate, RscUpdate]);
export type DevHmrMessage = typeof DevHmrMessage.Type;

export const DevHmrMessageJson = Schema.fromJsonString(DevHmrMessage);
