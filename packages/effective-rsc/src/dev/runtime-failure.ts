import { Effect, Inspectable, Predicate, Stream } from 'effect';

export type DevRuntimeFailure = {
  readonly _tag: 'RuntimeError' | 'UnhandledRejection';
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly componentStack?: string;
};

const fromUnknown = (
  _tag: DevRuntimeFailure['_tag'],
  value: unknown,
  fallbackMessage: string,
): DevRuntimeFailure => {
  if (Predicate.isError(value)) {
    return {
      _tag,
      name: value.name,
      message: value.message,
      ...(value.stack === undefined ? {} : { stack: value.stack }),
    };
  }

  return {
    _tag,
    name: _tag === 'UnhandledRejection' ? 'UnhandledRejection' : 'Error',
    message: value === undefined ? fallbackMessage : Inspectable.toStringUnknown(value),
  };
};

export const fromBrowserError = (event: Pick<ErrorEvent, 'error' | 'message'>): DevRuntimeFailure =>
  fromUnknown(
    'RuntimeError',
    event.error === null ? undefined : event.error,
    event.message || 'Unknown browser error.',
  );

export const fromUnhandledRejection = (
  event: Pick<PromiseRejectionEvent, 'reason'>,
): DevRuntimeFailure =>
  fromUnknown('UnhandledRejection', event.reason, 'Unhandled promise rejection.');

export const reportBrowserFailures = Effect.fnUntraced(function* (
  report: (failure: DevRuntimeFailure) => Effect.Effect<void>,
) {
  const errors = Stream.fromEventListener<ErrorEvent>(window, 'error').pipe(
    Stream.map(fromBrowserError),
  );
  const rejections = Stream.fromEventListener<PromiseRejectionEvent>(
    window,
    'unhandledrejection',
  ).pipe(Stream.map(fromUnhandledRejection));

  yield* Stream.merge(errors, rejections).pipe(Stream.runForEach(report));
});
