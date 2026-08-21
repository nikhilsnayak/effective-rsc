import { Context, Effect, Layer } from 'effect';

export class Greeting extends Context.Service<Greeting>()(
  '@effective-rsc/example-basic/greeting/Greeting',
  {
    make: Effect.succeed({
      message: 'Hello from an application Effect service.',
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
