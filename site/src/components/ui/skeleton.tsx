import { cn } from '../../lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='skeleton'
      className={cn('animate-pulse motion-reduce:animate-none rounded-none bg-muted', className)}
      {...props}
    />
  );
}

export { Skeleton };
