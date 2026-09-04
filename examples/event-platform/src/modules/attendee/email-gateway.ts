import { Context, Effect, Layer } from 'effect';

export type OutboundEmail = {
  readonly body: string;
  readonly emailId: string;
  readonly recipient: string;
  readonly subject: string;
};

export class EmailGateway extends Context.Service<EmailGateway>()(
  '@effective-rsc/example-event-platform/attendee/EmailGateway',
  {
    make: Effect.succeed({
      deliver: Effect.fn('EmailGateway.deliver')(function* (_message: OutboundEmail) {
        yield* Effect.void;
      }),
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
  static readonly layerTest = Layer.mock(this);
}
