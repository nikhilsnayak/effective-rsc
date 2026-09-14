import { Array, Effect, Predicate, Schema, Stream } from 'effect';

import { ServerFnInputError } from '../rsc/server-fn-error';
import { attachERSCMember, type ERSCIdentity, type ERSCMember } from './ersc-identity';
import type { AnyMiddleware } from './middleware';

const ServerFnInvocationTypeId: unique symbol = Symbol.for('ersc/ServerFnInvocation');

type ServerFnInvocation<ApplicationServices> = {
  readonly [ServerFnInvocationTypeId]: {
    readonly effect: Effect.Effect<unknown, ServerFnInputError, ApplicationServices>;
    readonly identity: ERSCIdentity<ApplicationServices>;
    readonly middleware: ReadonlyArray<AnyMiddleware<ApplicationServices>>;
  };
};

type ServerFnInvocationMatch<ApplicationServices> =
  | { readonly _tag: 'Native' }
  | { readonly _tag: 'IdentityMismatch' }
  | {
      readonly _tag: 'Match';
      readonly effect: Effect.Effect<unknown, ServerFnInputError, ApplicationServices>;
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

type ServerFnWireValue<Output> = [Output] extends [never]
  ? Output
  : [Output] extends [Stream.Stream<infer Value, infer _Error, infer _Services>]
    ? ReadableStream<Value>
    : Output;

interface ServerFunction<
  Args extends ReadonlyArray<unknown>,
  Output,
  ApplicationServices,
> extends ERSCMember<ApplicationServices, 'ServerFn'> {
  (...args: Args): Promise<ServerFnWireValue<Output>>;
}

type ServerFnOptions<Input, Output, Services> = {
  readonly handler: (
    ...args: ServerFnArguments<Input, 'Type'>
  ) => Effect.Effect<Output, never, Services>;
} & ([Input] extends [readonly []] ? { readonly input?: Input } : { readonly input: Input });

type ValidateServerFnOutput<Output, Services> = [Output] extends [never]
  ? unknown
  : [Output] extends [Stream.Stream<infer _Value, infer Error, infer Requirements>]
    ? [Error] extends [never]
      ? [Requirements] extends [Services]
        ? unknown
        : {
            readonly 'A streaming Server Function must fit the ERSC service universe': never;
          }
      : {
          readonly 'A streaming Server Function must drive its Stream error channel to never': never;
        }
    : [Extract<Output, Stream.Stream<unknown, unknown, unknown>>] extends [never]
      ? unknown
      : {
          readonly 'A Server Function cannot mix Stream and non-stream return values': never;
        };

export type ServerFnFactory<ApplicationServices, AvailableServices> = {
  readonly make: <
    const Input extends ServerFnInput<AvailableServices> = readonly [],
    Output = never,
  >(
    options: ServerFnOptions<Input, Output, AvailableServices> &
      ValidateServerFnOutput<Output, AvailableServices>,
  ) => ServerFunction<ServerFnArguments<Input, 'Encoded'>, Output, ApplicationServices>;
};

export const isServerFnStream = <Services>(
  output: unknown,
): output is Stream.Stream<unknown, never, Services> => Stream.isStream(output);

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
  make: ({ input = [], handler }) => {
    const schemas = Array.ensure<Schema.ConstraintDecoder<unknown, AvailableServices>>(input);
    const decode = Schema.decodeUnknownEffect(Schema.Tuple(schemas));
    const serverFunction = (...untrustedArgs: ServerFnArguments<typeof input, 'Encoded'>) => {
      // Unary functions still ignore extra native arguments and decode undefined when omitted.
      const effect = decode(Array.isArray(input) ? untrustedArgs : [untrustedArgs[0]]).pipe(
        Effect.mapError(
          (cause) =>
            new ServerFnInputError({ detail: { message: cause.message, name: cause.name } }),
        ),
        // Normalization preserves the positional Type mapping, which the generic branch erases.
        Effect.flatMap((args: ReadonlyArray<unknown>) =>
          handler(...(args as Parameters<typeof handler>)),
        ),
      );
      const unavailable =
        Promise.reject<ServerFnWireValue<Effect.Success<typeof effect>>>(directInvocationError());
      void unavailable.catch(() => undefined);

      return Object.assign(unavailable, {
        [ServerFnInvocationTypeId]: Object.freeze({ effect, identity, middleware }),
      });
    };

    return attachERSCMember(serverFunction, identity, 'ServerFn');
  },
});
