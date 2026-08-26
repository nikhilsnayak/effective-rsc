import { ArrowUpRight } from 'lucide-react';

const navigation = [
  { day: 'saturday', href: '/schedule/saturday', label: 'Saturday', shortDate: '22 Aug' },
  { day: 'sunday', href: '/schedule/sunday', label: 'Sunday', shortDate: '23 Aug' },
] as const;

export default function ConferenceNavigation() {
  return (
    <nav aria-label='Conference schedule'>
      <p className='text-muted-foreground text-xs font-semibold tracking-wider uppercase'>
        Programme
      </p>
      <ul className='mt-3 flex gap-2 lg:flex-col lg:gap-1'>
        {navigation.map((item) => (
          <li key={item.day} className='min-w-0 flex-1 lg:flex-none'>
            <a
              className='text-muted-foreground hover:bg-accent/60 hover:text-foreground flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition-colors'
              href={item.href}
            >
              <span>{item.label}</span>
              <span className='font-mono text-xs'>{item.shortDate}</span>
            </a>
          </li>
        ))}
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
}
