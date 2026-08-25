import { Effect } from 'effect';

import { ERSC } from '@/ersc';
import PersonalAgenda from '@/modules/agenda/components/personal-agenda';
import ConferenceNavigation from '@/modules/conference/components/conference-navigation';
import { ConferenceRepository } from '@/modules/conference/conference-repository';

export default ERSC.Layout.make({
  render: Effect.fn('ScheduleLayout')(function* ({ children }) {
    const repository = yield* ConferenceRepository;
    const agenda = yield* repository.agenda;

    return (
      <div className='mx-auto grid max-w-7xl px-5 sm:px-8 lg:grid-cols-[11rem_minmax(0,1fr)_17rem] lg:gap-8'>
        <aside className='border-b py-5 lg:border-r lg:border-b-0 lg:py-10 lg:pr-8'>
          <ConferenceNavigation />
        </aside>
        {children}
        <aside className='border-t py-7 lg:border-t-0 lg:border-l lg:py-10 lg:pl-8'>
          <PersonalAgenda agenda={agenda} />
        </aside>
      </div>
    );
  }),
});
