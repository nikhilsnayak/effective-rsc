import type { ReactNode } from 'react';

import { Sidebar, SidebarContent, SidebarProvider, SidebarTrigger } from '../components/ui/sidebar';
import type { DocEntry } from './model';
import { DocsNavigation } from './navigation';

export function DocumentationLayout({
  entries,
  children,
}: {
  readonly entries: ReadonlyArray<DocEntry>;
  readonly children: ReactNode;
}) {
  return (
    <SidebarProvider
      className='mx-auto min-h-0 max-w-[1320px] gap-10 px-5 md:px-8 print:block'
      style={{ '--sidebar-width': '14rem' } as React.CSSProperties}
    >
      <Sidebar className='sticky top-18 bottom-auto h-[calc(100svh-4.5rem)] pr-4 pb-10 group-data-[collapsible=offcanvas]:w-0 group-data-[collapsible=offcanvas]:overflow-hidden group-data-[collapsible=offcanvas]:pr-0 data-[side=left]:left-auto data-[side=left]:border-r-0'>
        <SidebarContent className='scroll-py-4 overscroll-contain py-8 md:mask-[linear-gradient(to_bottom,transparent,black_12px,black_calc(100%-12px),transparent)]'>
          <DocsNavigation entries={entries} />
        </SidebarContent>
      </Sidebar>
      <div className='min-w-0 flex-1'>
        <div className='mt-4 mb-6 flex items-center gap-2 md:hidden print:hidden'>
          <SidebarTrigger className='size-10' aria-label='Open documentation menu' />
          <span className='text-sm'>Documentation</span>
          <a
            href='/docs'
            className='text-muted-foreground ml-auto text-xs underline underline-offset-4'
          >
            Index
          </a>
        </div>
        <div className='flex gap-10 print:block'>{children}</div>
      </div>
    </SidebarProvider>
  );
}
