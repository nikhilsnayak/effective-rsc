const navigation = [
  { group: 'primary', href: '/catalog/primary', label: 'Primary', slot: 'A' },
  { group: 'secondary', href: '/catalog/secondary', label: 'Secondary', slot: 'B' },
] as const;

export default function FixtureNavigation() {
  return (
    <nav aria-label='Fixture catalog'>
      <p className='text-muted-foreground text-xs font-semibold tracking-wider uppercase'>
        Route groups
      </p>
      <ul className='mt-3 flex gap-2 lg:flex-col lg:gap-1'>
        {navigation.map((item) => (
          <li key={item.group} className='min-w-0 flex-1 lg:flex-none'>
            <a
              className='text-muted-foreground hover:bg-accent/60 hover:text-foreground flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition-colors'
              href={item.href}
            >
              <span>{item.label}</span>
              <span className='font-mono text-xs'>{item.slot}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
