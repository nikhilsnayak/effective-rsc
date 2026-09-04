import { Effect } from 'effect';

import { ERSC } from '@/ersc';
import FixtureNavigation from '@/modules/fixture/components/fixture-navigation';
import { FixtureService } from '@/modules/fixture/service';
import FixtureSelection from '@/modules/selection/components/fixture-selection';

export default ERSC.Layout.make({
  render: Effect.fn('CatalogLayout')(function* ({ children }) {
    const service = yield* FixtureService;
    const selection = yield* service.selection;

    return (
      <div className='mx-auto grid max-w-7xl px-5 sm:px-8 lg:grid-cols-[11rem_minmax(0,1fr)_17rem] lg:gap-8'>
        <aside className='border-b py-5 lg:border-r lg:border-b-0 lg:py-10 lg:pr-8'>
          <FixtureNavigation />
        </aside>
        {children}
        <aside className='border-t py-7 lg:border-t-0 lg:border-l lg:py-10 lg:pl-8'>
          <FixtureSelection selection={selection} />
        </aside>
      </div>
    );
  }),
});
