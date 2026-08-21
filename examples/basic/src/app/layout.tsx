import { Effect } from 'effect';
import { Layout, type LayoutProps } from 'effective-rsc';

export default Layout.make(
  Effect.fn('RootLayout')(function* ({ children }: LayoutProps) {
    return yield* Effect.succeed(
      <html lang='en'>
        <head>
          <title>effective-rsc</title>
        </head>
        <body className='font-sans'>{children}</body>
      </html>,
    );
  }),
);
