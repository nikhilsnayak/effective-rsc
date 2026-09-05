import { Array, Effect, Predicate, Schema } from 'effect';

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

type ServerFnInput<Services> =
  | Schema.ConstraintDecoder<unknown, Services>
  | ReadonlyArray<Schema.ConstraintDecoder<unknown, Services>>;

type ServerFnArguments<Input, Side extends 'Type' | 'Encoded'> =
  Input extends ReadonlyArray<Schema.Constraint>
    ? {
        -readonly [Key in keyof Input]: Input[Key] extends Schema.Constraint
          ? Input[Key][Side]
          : never;
      }
    : Input extends Schema.Constraint
      ? [Input[Side]]
      : never;

interface ServerFunction<
  Args extends ReadonlyArray<unknown>,
  Output,
  ApplicationServices,
> extends ERSCMember<ApplicationServices, 'ServerFn'> {
  (...args: Args): Promise<Output>;
}

type ServerFnOptions<Input, Output, Error, Services> = {
  readonly input: Input;
  readonly handler: (
    ...args: ServerFnArguments<Input, 'Type'>
  ) => Effect.Effect<Output, Error, Services>;
};

export type ServerFnFactory<ApplicationServices, AvailableServices> = {
  readonly make: <const Input extends ServerFnInput<AvailableServices>, Output, Error>(
    options: ServerFnOptions<Input, Output, Error, AvailableServices>,
  ) => ServerFunction<ServerFnArguments<Input, 'Encoded'>, Output, ApplicationServices>;
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
    const schemas = Array.ensure<Schema.ConstraintDecoder<unknown, AvailableServices>>(input);
    const decode = Schema.decodeUnknownEffect(Schema.Tuple(schemas));
    const serverFunction = (...untrustedArgs: ServerFnArguments<typeof input, 'Encoded'>) => {
      // Unary functions still ignore extra native arguments and decode undefined when omitted.
      const effect = decode(Array.isArray(input) ? untrustedArgs : [untrustedArgs[0]]).pipe(
        // Normalization preserves the positional Type mapping, which the generic branch erases.
        Effect.flatMap((args: ReadonlyArray<unknown>) =>
          handler(...(args as ServerFnArguments<typeof input, 'Type'>)),
        ),
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
