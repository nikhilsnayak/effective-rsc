import { describe, expect, it } from '@effect/vitest';

import { Loading } from '../../src/application/loading';

describe('Loading.make', () => {
  it('preserves the synchronous fallback renderer', () => {
    const render = () => <p>Loading...</p>;
    const RootLoading = Loading.make(render);

    expect(RootLoading === render).toBe(true);
    expect(RootLoading()).toEqual(<p>Loading...</p>);
  });
});
