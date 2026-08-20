'use server-entry';

import { Counter } from '../components/Counter';
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
        <h1>This is an RSC!</h1>
        <Nav pages={pages} currentPage={currentPage} />
        <Counter />
      </body>
    </html>
  );
}
