/**
 * @title An application-owned service
 *
 * ERSC consumes the service contract and Layer; their construction is ordinary Effect code.
 */
import { Context, Effect, Layer } from 'effect';

export type CatalogItem = {
  readonly name: string;
  readonly price: number;
};

export class Catalog extends Context.Service<Catalog>()('shop/services/Catalog', {
  make: Effect.succeed({
    featured: Effect.succeed([
      { name: 'Mechanical keyboard', price: 129 },
      { name: 'Studio headphones', price: 249 },
    ] satisfies ReadonlyArray<CatalogItem>),
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
