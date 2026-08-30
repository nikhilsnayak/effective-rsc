import { Effect, Predicate, Schema } from 'effect';

import { attachERSCIdentity, type ERSCIdentity, type ERSCMember } from './ersc-identity';

const ServerFnInvocationTypeId: unique symbol = Symbol.for('ersc/ServerFnInvocation');

class ServerFnOperationError extends Schema.TaggedError<ServerFnOperationError>()(
  'ServerFnOperationError',
  { cause: Schema.Defect() },
) {}

type ServerFnInvocationMetadata<Output, Services> = {
  readonly effect: Effect.Effect<Output, ServerFnOperationError, Services>;
  readonly identity: ERSCIdentity<Services>;
};

type ServerFnInvocationMatch<Services> =
  | { readonly _tag: 'Native' }
  | { readonly _tag: 'IdentityMismatch' }
  | {
      readonly _tag: 'Match';
      readonly effect: Effect.Effect<unknown, ServerFnOperationError, Services>;
    };

interface ServerFunction<Input, Output, Services> extends ERSCMember<Services> {
  (input: Input): Promise<Output>;
}

type ServerFnOptions<InputSchema extends Schema.Constraint, Output, Error, Services> = {
  readonly input: InputSchema;
  readonly handler: (input: InputSchema['Type']) => Effect.Effect<Output, Error, Services>;
};

export type ServerFnFactory<Services> = {
  readonly make: <InputSchema extends Schema.ConstraintDecoder<unknown, Services>, Output, Error>(
    options: ServerFnOptions<InputSchema, Output, Error, Services>,
  ) => ServerFunction<InputSchema['Encoded'], Output, Services>;
};

const directInvocationError = () =>
  new Error(
    'An ERSC ServerFn is a framework intrinsic and cannot be invoked directly in the server graph.',
  );

const isServerFnInvocationMetadataFor = <Services>(
  value: unknown,
  identity: ERSCIdentity<Services>,
): value is ServerFnInvocationMetadata<unknown, Services> =>
  Predicate.hasProperty(value, 'effect') &&
  Effect.isEffect(value.effect) &&
  Predicate.hasProperty(value, 'identity') &&
  value.identity === identity;

export const matchServerFnInvocation = <Services>(
  value: unknown,
  identity: ERSCIdentity<Services>,
): ServerFnInvocationMatch<Services> => {
  if (!Predicate.hasProperty(value, ServerFnInvocationTypeId)) {
    return { _tag: 'Native' };
  }

  const metadata = value[ServerFnInvocationTypeId];
  if (!isServerFnInvocationMetadataFor(metadata, identity)) {
    return Predicate.hasProperty(metadata, 'identity')
      ? { _tag: 'IdentityMismatch' }
      : { _tag: 'Native' };
  }

  return { _tag: 'Match', effect: metadata.effect };
};

export const makeServerFnFactory = <Services>(
  identity: ERSCIdentity<Services>,
): ServerFnFactory<Services> => ({
  make: ({ input, handler }) => {
    const decode = Schema.decodeUnknownEffect(input);
    const serverFunction = (untrustedInput: typeof input.Encoded) => {
      const effect = decode(untrustedInput).pipe(
        Effect.flatMap(handler),
        Effect.mapError((cause) => new ServerFnOperationError({ cause })),
      );
      const unavailable = Promise.reject<Effect.Success<typeof effect>>(directInvocationError());
      void unavailable.catch(() => undefined);

      return Object.assign(unavailable, {
        [ServerFnInvocationTypeId]: Object.freeze({ effect, identity }),
      });
    };

    return attachERSCIdentity(serverFunction, identity);
  },
});
