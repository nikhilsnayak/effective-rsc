import type { PageProps } from '../framework/ssg';

export function Nav({ pages, currentPage }: PageProps) {
  return (
    <nav>
      <ul>
        {pages.map((page) => (
          <li key={page.url}>
            <a
              href={page.url}
              aria-current={page.url === currentPage.url ? 'page' : undefined}
            >
              {page.name.replace('.html', '')}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
