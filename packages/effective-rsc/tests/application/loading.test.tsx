import { describe, expect, it } from '@effect/vitest';

import { Application } from '../../src/application/ersc';

const ERSC = Application.ersc();

describe('ERSC.Loading.make', () => {
  it('runs the synchronous fallback renderer', () => {
    const render = () => <p>Loading...</p>;
    const RootLoading = ERSC.Loading.make({ render });

    expect(RootLoading()).toEqual(<p>Loading...</p>);
  });
});
