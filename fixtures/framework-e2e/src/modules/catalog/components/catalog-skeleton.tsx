import { Skeleton } from '@/components/ui/skeleton';
import { ERSC } from '@/ersc';

const CatalogSkeleton = ERSC.Loading.make({
  render: () => (
    <main className='min-w-0 py-8 lg:py-10' aria-busy='true' aria-label='Loading catalog'>
      <div className='border-b pb-7'>
        <Skeleton className='h-5 w-28' />
        <Skeleton className='mt-4 h-10 w-64 max-w-full' />
        <Skeleton className='mt-3 h-5 w-lg max-w-full' />
      </div>
      <p className='sr-only'>Loading fixture catalog...</p>
      <div className='space-y-3 py-7'>
        <Skeleton className='h-48 w-full rounded-lg' />
        <Skeleton className='h-48 w-full rounded-lg' />
      </div>
    </main>
  ),
});

export default CatalogSkeleton;
