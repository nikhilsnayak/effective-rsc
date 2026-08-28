import { Context, FiberSet, Layer, Scope } from 'effect';
import { HttpClient } from 'effect/unstable/http';

export class ClientRuntime extends Context.Service<ClientRuntime>()(
  'ersc/client/client-runtime/ClientRuntime',
  {
    make: FiberSet.makeRuntimePromise<HttpClient.HttpClient | Scope.Scope>(),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
