import { Context, Effect, Option, Schema } from 'effect';
import { useActionState } from 'react';
import { expectTypeOf } from 'vitest';

import { Application } from '../../src/application/ersc';

const ERSC = Application.ersc();
const State = Schema.Struct({ count: Schema.Finite });
const Form = Schema.fromFormData(Schema.Struct({ name: Schema.NonEmptyString }));
const action = ERSC.ServerFn.make({
  input: [State, Form],
  handler: (previousState, form) => {
    const stateIsNotAny: 0 extends 1 & typeof previousState ? false : true = true;
    const formIsNotAny: 0 extends 1 & typeof form ? false : true = true;
    void stateIsNotAny;
    void formIsNotAny;
    const name: string = form.name;
    void name;
    return Effect.succeed({ count: previousState.count + 1 });
  },
});
const result: Promise<{ readonly count: number }> = action({ count: 0 }, new FormData());
void result;
// @ts-expect-error The caller sends encoded FormData, not the decoded record.
void action({ count: 0 }, { name: 'Nikhil' });
// @ts-expect-error Argument order is fixed by input.
void action(new FormData(), { count: 0 });
// @ts-expect-error Both arguments are required.
void action({ count: 0 });
// @ts-expect-error The declaration has exactly two arguments.
void action({ count: 0 }, new FormData(), 'extra');

function ActionForm() {
  const [state, formAction] = useActionState(action, { count: 0 });
  return <form action={formAction}>{state.count}</form>;
}
void ActionForm;

const transformed = ERSC.ServerFn.make({
  input: [Schema.FiniteFromString, Schema.String] as const,
  handler: Effect.fnUntraced(function* (count, text) {
    const value: number = count;
    return yield* Effect.succeed(`${value}:${text}`);
  }),
});
const bound: (text: string) => Promise<string> = transformed.bind(null, '2');
void bound;
// @ts-expect-error Caller uses the encoded number string.
void transformed(2, 'text');

const tuple = ERSC.ServerFn.make({
  input: Schema.Tuple([Schema.String, Schema.Finite]),
  handler: Effect.succeed,
});
void tuple(['text', 2]);
// @ts-expect-error A Tuple Schema still describes one argument.
void tuple('text', 2);
const noArgs = ERSC.ServerFn.make({ input: [], handler: () => Effect.void });
void noArgs();
// @ts-expect-error An empty schema list declares no arguments.
void noArgs('extra');

const omittedInput = ERSC.ServerFn.make({ handler: () => Effect.succeed('done') });
expectTypeOf<Parameters<typeof omittedInput>>().toEqualTypeOf<[]>();
expectTypeOf<ReturnType<typeof omittedInput>>().toEqualTypeOf<Promise<string>>();
void omittedInput();
// @ts-expect-error Omitted input declares no arguments.
void omittedInput('extra');
ERSC.ServerFn.make({
  // @ts-expect-error A handler cannot require arguments without an input schema.
  handler: (value: string) => Effect.succeed(value),
});
// @ts-expect-error A declared input schema must be provided at runtime.
ERSC.ServerFn.make<typeof Schema.String, string>({ handler: (value) => Effect.succeed(value) });
// @ts-expect-error A declared positional schema list must be provided at runtime.
ERSC.ServerFn.make<readonly [typeof Schema.String], string>({
  handler: (value) => Effect.succeed(value),
});
declare const optionalSchema: typeof Schema.String | undefined;
ERSC.ServerFn.make({
  // @ts-expect-error Narrow uncertain schema presence before declaring a Server Function.
  input: optionalSchema,
  handler: () => Effect.void,
});
ERSC.ServerFn.make({
  // @ts-expect-error Omitting input does not allow typed handler failures.
  handler: () => Effect.fail('failure'),
});

class DecoderService extends Context.Service<DecoderService, object>()(
  'ersc/tests/types/server-fn/DecoderService',
) {}
const ServiceSchema = Schema.String.pipe(
  Schema.catchDecodingWithContext(() => Effect.map(DecoderService, () => Option.some('fallback'))),
);
ERSC.ServerFn.make({
  // @ts-expect-error Every positional decoder must fit the service universe.
  input: [Schema.String, ServiceSchema],
  handler: () => Effect.void,
});
const ProvideDecoder = ERSC.Middleware.make<{ provides: DecoderService }>((operation) =>
  operation.pipe(Effect.provideService(DecoderService, {})),
);
ERSC.withMiddleware(ProvideDecoder).ServerFn.make({
  input: [Schema.String, ServiceSchema],
  handler: (first, second) => Effect.succeed(first + second),
});
