'use client';

import { useEffect } from 'react';

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '../components/ui/sidebar';
import { usePathname } from '../hooks/use-pathname';
import type { DocEntry } from './model';

export function DocsNavigation({ entries }: { readonly entries: ReadonlyArray<DocEntry> }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  useEffect(() => {
    const navigation = window.navigation;
    const closeMenu = () => setOpenMobile(false);
    navigation?.addEventListener('navigatesuccess', closeMenu);
    return () => navigation?.removeEventListener('navigatesuccess', closeMenu);
  }, [setOpenMobile]);
  const documents = entries.filter((page) => page.kind === 'Document');
  const currentHref = documents.findLast(
    (page) => pathname === page.href || pathname?.startsWith(`${page.href}/`),
  )?.href;
  const groups = [...new Set(documents.map((page) => page.section))].map((title) => ({
    title,
    pages: documents.filter((page) => page.section === title),
  }));
  return (
    <nav aria-label='Documentation' className='flex flex-col gap-6'>
      {groups.map((group) => (
        <SidebarGroup key={group.title} className='p-0'>
          {group.pages[0]?.href !== '/docs' && (
            <SidebarGroupLabel
              render={<h2>{group.title}</h2>}
              className='px-3 text-xs font-semibold'
            />
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {group.pages.map((page) => (
                <SidebarMenuItem key={page.href}>
                  <SidebarMenuButton
                    render={
                      <a
                        href={page.href}
                        data-ersc-transition-types='docs-jump'
                        aria-current={page.href === currentHref ? 'page' : undefined}
                      >
                        {page.href.split('/').length <= 3 ? 'Overview' : page.title}
                      </a>
                    }
                    isActive={page.href === currentHref}
                    className='text-muted-foreground data-active:border-primary data-active:bg-primary/5 data-active:text-primary h-auto min-h-9 border-l border-transparent px-3 py-2 text-xs leading-5'
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </nav>
  );
}
