import { NavigationTransition } from '@/components/navigation-transition';
import { Skeleton } from '@/components/ui/skeleton';
import { OrganizerERSC } from '@/modules/organizer/current-organizer';

const ProgrammeLoading = OrganizerERSC.Loading.make({
  render: () => (
    <NavigationTransition>
      <main
        aria-busy='true'
        aria-label='Loading programme workspace'
        className='mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:py-14'
      >
        <Skeleton className='h-5 w-36' />
        <div className='mt-7 grid gap-6 border-b pb-8 lg:grid-cols-[minmax(0,1fr)_20rem]'>
          <div>
            <Skeleton className='h-6 w-32' />
            <Skeleton className='mt-4 h-11 w-lg max-w-full' />
            <Skeleton className='mt-3 h-5 w-xl max-w-full' />
          </div>
          <Skeleton className='h-32 w-full rounded-xl' />
        </div>
        <div className='grid gap-4 py-9 md:grid-cols-2'>
          <Skeleton className='h-56 w-full rounded-xl' />
          <Skeleton className='h-56 w-full rounded-xl' />
        </div>
      </main>
    </NavigationTransition>
  ),
});

export default ProgrammeLoading;
