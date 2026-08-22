import { Effect, Schema } from 'effect';

declare const ServerFnServicesTypeId: unique symbol;

export type ServerFunction<Input, Output, Services> = {
  (input: Input): Promise<Output>;
  readonly [ServerFnServicesTypeId]?: Services;
};

type ServerFnOptions<InputSchema extends Schema.Constraint, Output, Error, Services> = {
  readonly input: InputSchema;
  readonly handler: (input: InputSchema['Type']) => Effect.Effect<Output, Error, Services>;
};

const make = <InputSchema extends Schema.Constraint, Output, Error, Services>({
  input,
  handler,
}: ServerFnOptions<InputSchema, Output, Error, Services>): ServerFunction<
  InputSchema['Type'],
  Output,
  Services | InputSchema['DecodingServices']
> => {
  const decode = Schema.decodeUnknownEffect(input);

  return ((untrustedInput: unknown) =>
    decode(untrustedInput).pipe(Effect.flatMap(handler))) as unknown as ServerFunction<
    InputSchema['Type'],
    Output,
    Services | InputSchema['DecodingServices']
  >;
};

export const ServerFn = { make } as const;
