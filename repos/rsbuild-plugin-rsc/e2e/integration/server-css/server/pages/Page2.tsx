'use server-entry';

import { Page2Child } from './Page2Child';
import './Page2.css';

export async function Page2() {
  return (
    <section className="page-two-css" data-testid="server-css-page-two">
      <h3>Page 2</h3>
      <p className="shared-server-css" data-testid="server-css-shared-page-two">
        Shared stylesheet from Page 2
      </p>
      <Page2Child />
    </section>
  );
}
