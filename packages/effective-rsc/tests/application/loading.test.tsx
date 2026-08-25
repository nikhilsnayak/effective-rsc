import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { Application } from '../../src/application/ersc';

const ERSC = Application.ersc();

describe('ERSC.Loading.make', () => {
  it('runs the synchronous fallback renderer', () => {
    const render = () => <p>Loading...</p>;
    const RootLoading = ERSC.Loading.make({ render });

    expect(RootLoading()).toEqual(<p>Loading...</p>);
  });

  it('rejects asynchronous and effectful fallback renderers at the type boundary', () => {
    const typecheckInvalidRenderers = (loading: boolean) => {
      ERSC.Loading.make({
        // @ts-expect-error Loading must be immediately renderable, not asynchronous.
        // oxlint-disable-next-line effecttsgo/async-function -- intentional invalid renderer fixture
        render: async () => <p>Loading...</p>,
      });
      ERSC.Loading.make({
        // @ts-expect-error Loading is service-free and does not execute an Effect operation.
        render: () => Effect.succeed(<p>Loading...</p>),
      });
      ERSC.Loading.make({
        // @ts-expect-error Loading cannot hide an Effect behind a union return type.
        render: () => (loading ? <p>Loading...</p> : Effect.succeed(<p>Loading...</p>)),
      });
    };

    expect(typecheckInvalidRenderers).toBeTypeOf('function');
  });
});
