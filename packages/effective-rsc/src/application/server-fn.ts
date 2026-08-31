import { Effect, Predicate, Schema } from 'effect';

import { attachERSCMember, type ERSCIdentity, type ERSCMember } from './ersc-identity';
import type { AnyMiddleware } from './middleware';

const ServerFnInvocationTypeId: unique symbol = Symbol.for('ersc/ServerFnInvocation');

class ServerFnOperationError extends Schema.TaggedError<ServerFnOperationError>()(
  'ServerFnOperationError',
  { cause: Schema.Defect() },
) {}

type ServerFnInvocation<ApplicationServices> = {
  readonly [ServerFnInvocationTypeId]: {
    readonly effect: Effect.Effect<unknown, ServerFnOperationError, ApplicationServices>;
    readonly identity: ERSCIdentity<ApplicationServices>;
    readonly middleware: ReadonlyArray<AnyMiddleware<ApplicationServices>>;
  };
};

type ServerFnInvocationMatch<ApplicationServices> =
  | { readonly _tag: 'Native' }
  | { readonly _tag: 'IdentityMismatch' }
  | {
      readonly _tag: 'Match';
      readonly effect: Effect.Effect<unknown, ServerFnOperationError, ApplicationServices>;
      readonly middleware: ReadonlyArray<AnyMiddleware<ApplicationServices>>;
    };

interface ServerFunction<Input, Output, ApplicationServices> extends ERSCMember<
  ApplicationServices,
  'ServerFn'
> {
  (input: Input): Promise<Output>;
}

type ServerFnOptions<InputSchema extends Schema.Constraint, Output, Error, Services> = {
  readonly input: InputSchema;
  readonly handler: (input: InputSchema['Type']) => Effect.Effect<Output, Error, Services>;
};

export type ServerFnFactory<ApplicationServices, AvailableServices> = {
  readonly make: <
    InputSchema extends Schema.ConstraintDecoder<unknown, AvailableServices>,
    Output,
    Error,
  >(
    options: ServerFnOptions<InputSchema, Output, Error, AvailableServices>,
  ) => ServerFunction<InputSchema['Encoded'], Output, ApplicationServices>;
};

const directInvocationError = () =>
  new TypeError(
    'An ERSC ServerFn is a framework intrinsic and cannot be invoked directly in the server graph.',
  );

const isServerFnInvocation = <ApplicationServices>(
  value: unknown,
): value is ServerFnInvocation<ApplicationServices> =>
  Predicate.hasProperty(value, ServerFnInvocationTypeId);

export const matchServerFnInvocation = <ApplicationServices>(
  value: unknown,
  identity: ERSCIdentity<ApplicationServices>,
): ServerFnInvocationMatch<ApplicationServices> => {
  if (!isServerFnInvocation<ApplicationServices>(value)) {
    return { _tag: 'Native' };
  }

  // The framework-owned brand proves the state shape; matching the opaque identity proves the
  // application service universe erased by the native React invocation.
  const metadata = value[ServerFnInvocationTypeId];
  if (metadata.identity !== identity) {
    return { _tag: 'IdentityMismatch' };
  }

  return { _tag: 'Match', effect: metadata.effect, middleware: metadata.middleware };
};

export const makeServerFnFactory = <ApplicationServices, AvailableServices>(
  identity: ERSCIdentity<ApplicationServices>,
  middleware: ReadonlyArray<AnyMiddleware<ApplicationServices>>,
): ServerFnFactory<ApplicationServices, AvailableServices> => ({
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
        [ServerFnInvocationTypeId]: Object.freeze({ effect, identity, middleware }),
      });
    };

    return attachERSCMember(serverFunction, identity, 'ServerFn');
  },
});
