import { Loading } from 'effective-rsc';

import { Skeleton } from '@/components/ui/skeleton';

const NavigationSkeleton = Loading.make(() => (
  <div aria-busy='true' aria-label='Loading conference navigation'>
    <Skeleton className='h-3 w-20' />
    <div className='mt-3 flex gap-2 lg:flex-col'>
      <Skeleton className='h-9 flex-1 lg:w-full' />
      <Skeleton className='h-9 flex-1 lg:w-full' />
    </div>
  </div>
));

export default NavigationSkeleton;
