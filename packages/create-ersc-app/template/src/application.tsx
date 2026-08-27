import { Effect } from 'effect';
import { Application } from 'effective-rsc';

import './styles.css';

const ERSC = Application.ersc();

const RootLayout = ERSC.Layout.make({
  render: ({ children }) =>
    Effect.succeed(
      <html lang='en'>
        <body className='min-h-screen bg-slate-50 text-slate-800 antialiased'>{children}</body>
      </html>,
    ),
});

const HomePage = ERSC.Page.make({
  render: () =>
    Effect.succeed(
      <main className='mx-auto w-full max-w-2xl px-6 py-32'>
        <p className='text-sm font-medium text-slate-500'>effective-rsc</p>
        <h1 className='mt-2 text-4xl font-semibold tracking-tight text-slate-950 sm:text-6xl'>
          Your application is ready.
        </h1>
        <p className='mt-4 text-slate-500'>Edit src/application.tsx to begin.</p>
      </main>,
    ),
});

export default ERSC.make({
  routes: ERSC.Routes.make({ layout: RootLayout }).page('/', HomePage),
});
