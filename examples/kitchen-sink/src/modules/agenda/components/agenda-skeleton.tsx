import { Loading } from 'effective-rsc';

import { Skeleton } from '@/components/ui/skeleton';

const AgendaSkeleton = Loading.make(() => (
  <div aria-busy='true' aria-label='Loading personal agenda'>
    <div className='flex items-center justify-between'>
      <Skeleton className='h-4 w-24' />
      <Skeleton className='size-5 rounded-full' />
    </div>
    <div className='mt-4 space-y-4 border-y py-4'>
      <Skeleton className='h-14 w-full' />
      <Skeleton className='h-14 w-full' />
    </div>
  </div>
));

export default AgendaSkeleton;
