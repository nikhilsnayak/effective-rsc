'use server-entry';

import { Nav } from '../components/Nav';
import type { PageProps } from '../framework/ssg';
import '../components/style.css';

export default function Index({ pages, currentPage }: PageProps) {
  return (
    <html lang="en">
      <head>
        <title>Static RSC</title>
      </head>
      <body>
        <h1>This is another RSC!</h1>
        <Nav pages={pages} currentPage={currentPage} />
      </body>
    </html>
  );
}
