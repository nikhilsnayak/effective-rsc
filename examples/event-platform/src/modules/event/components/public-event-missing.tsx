import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function PublicEventMissing() {
  return (
    <main className='mx-auto max-w-3xl px-5 py-20 text-center sm:px-8'>
      <p className='text-muted-foreground text-sm font-medium'>Event not found</p>
      <h1 className='mt-3 text-3xl font-semibold tracking-[-0.03em]'>This event is not public.</h1>
      <p className='text-muted-foreground mt-3 leading-7'>
        It may still be a draft, or the organizer may have changed its address.
      </p>
      <a className={cn(buttonVariants({ variant: 'outline' }), 'mt-7')} href='/'>
        Browse events
      </a>
    </main>
  );
}
