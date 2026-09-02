import { Context, FiberSet, Layer, Scope } from 'effect';
import { HttpClient } from 'effect/unstable/http';

export class BrowserEffectRunner extends Context.Service<BrowserEffectRunner>()(
  'ersc/client/BrowserEffectRunner',
  {
    make: FiberSet.makeRuntimePromise<HttpClient.HttpClient | Scope.Scope>(),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
