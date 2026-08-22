import { Effect } from 'effect';
import { Slot } from 'effective-rsc';
import { ArrowUpRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  ConferenceRepository,
  type ConferenceDay,
} from '@/modules/conference/conference-repository';

const makeConferenceNavigation = (activeDay: ConferenceDay) =>
  Slot.make(
    Effect.fn(
      activeDay === 'saturday' ? 'SaturdayConferenceNavigation' : 'SundayConferenceNavigation',
    )(function* () {
      const repository = yield* ConferenceRepository;
      const navigation = yield* repository.navigation;

      return (
        <nav
          aria-label='Conference schedule'
          data-navigation-completed-at={navigation.completedAt}
          data-navigation-started-at={navigation.startedAt}
        >
          <p className='text-muted-foreground text-xs font-semibold tracking-wider uppercase'>
            Programme
          </p>
          <ul className='mt-3 flex gap-2 lg:flex-col lg:gap-1'>
            {navigation.data.map((item) => {
              const isActive = item.day === activeDay;

              return (
                <li key={item.day} className='min-w-0 flex-1 lg:flex-none'>
                  <a
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                      isActive
                        ? 'bg-accent font-medium text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                    )}
                    href={item.href}
                  >
                    <span>{item.label}</span>
                    <span className='font-mono text-xs'>{item.shortDate}</span>
                  </a>
                </li>
              );
            })}
          </ul>
          <a
            className='text-muted-foreground hover:text-foreground mt-6 hidden items-center gap-1.5 text-xs underline-offset-4 hover:underline lg:flex'
            href='https://maps.google.com/?q=Bangalore+International+Centre'
          >
            Venue map
            <ArrowUpRight aria-hidden='true' className='size-3.5' />
          </a>
        </nav>
      );
    }),
  );

export const SaturdayConferenceNavigation = makeConferenceNavigation('saturday');
export const SundayConferenceNavigation = makeConferenceNavigation('sunday');
