import { Context, Effect, Layer } from 'effect';

import { PaymentDeclined, type PaymentMethod } from '@/modules/registration/model';

export type ChargeInput = {
  readonly amountMinor: number;
  readonly currency: string;
  readonly idempotencyKey: string;
  readonly paymentMethod: PaymentMethod;
};

export class PaymentGateway extends Context.Service<PaymentGateway>()(
  '@effective-rsc/example-event-platform/registration/PaymentGateway',
  {
    make: Effect.succeed({
      charge: Effect.fn('PaymentGateway.charge')(function* (input: ChargeInput) {
        if (input.paymentMethod === 'decline') {
          return yield* new PaymentDeclined({ reason: 'The deterministic test payment declined.' });
        }

        return {
          providerReference: `local-payment-${input.idempotencyKey}`,
        };
      }),
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
  static readonly layerTest = Layer.mock(this);
}
