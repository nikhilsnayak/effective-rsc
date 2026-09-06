import { Effect } from 'effect';
import { ArrowRight, ArrowUpRight } from 'lucide-react';

import { CodeBlock } from './components/code-block';
import { PageMetadata } from './components/page-metadata';
import { buttonVariants } from './components/ui/button';
import { DocumentationError } from './docs/files';
import { readRequiredDocument } from './docs/service';
import { ERSC } from './ersc';
import { introductionUrl } from './seo';

const features = [
  {
    number: '01',
    title: 'One application runtime',
    description:
      'Declare your services once. Pages, components, and Server Functions use the same Effect runtime, with explicit dependencies and scoped resources.',
    href: '/docs/guides/services',
  },
  {
    number: '02',
    title: 'Native React, end to end',
    description:
      'Render Server Components, stream with Suspense, and submit native forms. React owns the UI and its protocols.',
    href: '/docs/guides/server-functions',
  },
  {
    number: '03',
    title: 'Routes you can read',
    description:
      'Compose pages, layouts, and middleware in TypeScript. The route graph is explicit, with no hidden filename conventions.',
    href: '/docs/guides/routing',
  },
];

const HomeExample = ERSC.Component.make({
  render: Effect.fn('HomeExample.render')(function* () {
    const example = yield* readRequiredDocument('/docs/getting-started/first-application');
    if (example.code === undefined) {
      return yield* new DocumentationError({ message: 'The homepage requires a source example.' });
    }
    return (
      <CodeBlock code={example.code} language='tsx' label='src/application.tsx' variant='block' />
    );
  }),
});

export function Home() {
  return (
    <>
      <PageMetadata
        title='effective-rsc · React Server Components with Effect and Bun'
        description='An Effect-native React Server Components framework for Bun. Explicit routes, request-scoped services, streaming, and native Server Functions.'
        path='/'
      />
      <div className='mx-auto max-w-270 px-5 pb-12 md:px-8 md:pb-20'>
        <section className='pt-14 pb-12 md:pt-24 md:pb-20'>
          <p className='text-muted-foreground flex items-center gap-2.5 font-mono text-[0.65rem] leading-relaxed tracking-wide md:text-xs'>
            <span className='bg-primary size-1.5' />
            React Server Components · Effect · Bun
          </p>
          <h1 className='mt-6 text-[clamp(2.3rem,5vw,4rem)] leading-[1.12] font-semibold tracking-[-0.065em] text-balance'>
            React owns the UI.
            <br />
            <span className='text-muted-foreground font-normal'>Effect owns the runtime.</span>
          </h1>
          <p className='text-muted-foreground mt-6 max-w-152.5 text-base leading-relaxed text-pretty md:text-lg'>
            A small, opinionated framework that brings Effect’s services, concurrency, and resource
            management to React Server Components.
          </p>
          <div className='my-7 flex flex-wrap items-center gap-7'>
            <a
              className={buttonVariants({
                variant: 'default',
                size: 'lg',
                className: 'h-10 gap-2 px-4 text-sm',
              })}
              href='/docs/getting-started'
            >
              Get started <ArrowRight size={16} aria-hidden='true' />
            </a>
            <a
              className='inline-flex items-center gap-2 text-sm underline-offset-4 hover:underline'
              href='https://github.com/nikhilsnayak/effective-rsc'
              target='_blank'
              rel='noopener noreferrer'
            >
              View on GitHub <ArrowUpRight size={15} aria-hidden='true' />
            </a>
          </div>
          <div className='max-w-120'>
            <CodeBlock
              code='bunx create-ersc-app my-app'
              language='sh'
              label='Create an application'
              variant='command'
            />
          </div>
          <p className='text-muted-foreground mt-4 flex flex-wrap gap-x-2 gap-y-1 text-xs leading-relaxed'>
            Experimental. Built on React Canary and Effect v4.{' '}
            <a
              className='inline-flex items-center gap-1 underline underline-offset-4'
              href='/docs/advanced/client-navigation'
            >
              Browser support and navigation <ArrowUpRight size={12} aria-hidden='true' />
            </a>
          </p>
          <a
            className='text-muted-foreground hover:text-foreground mt-5 inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline'
            href={introductionUrl}
          >
            Read the introduction <ArrowUpRight size={14} aria-hidden='true' />
          </a>
        </section>
        <section
          className='grid items-start gap-6 border-t py-10 md:grid-cols-[0.8fr_1.3fr] md:gap-12 md:py-14'
          aria-labelledby='example-heading'
        >
          <div>
            <p className='text-muted-foreground font-mono text-xs leading-relaxed tracking-wide'>
              Start with the familiar
            </p>
            <h2
              id='example-heading'
              className='my-4 text-3xl leading-tight font-medium tracking-tight'
            >
              An application.
              <br />
              Not a new language.
            </h2>
            <p className='text-muted-foreground mb-6 text-sm leading-relaxed md:max-w-80'>
              Plain TypeScript, React, and Effect. Create an identity, define your pages, and
              compose your routes.
            </p>
            <a
              className='inline-flex items-center gap-2 text-sm underline-offset-4 hover:underline'
              href='/docs/getting-started/first-application'
            >
              Explore this example <ArrowRight size={15} aria-hidden='true' />
            </a>
          </div>
          <HomeExample />
        </section>
        <section
          className='grid gap-8 border-t pt-12 md:grid-cols-3'
          aria-label='Framework principles'
        >
          {features.map((feature) => (
            <article key={feature.number} className='flex gap-6 md:flex-col md:gap-0'>
              <span className='text-primary pt-1 font-mono text-xs'>{feature.number}</span>
              <div className='flex flex-1 flex-col items-start'>
                <h2 className='mb-3 text-base font-medium tracking-tight md:mt-4'>
                  {feature.title}
                </h2>
                <p className='text-muted-foreground mb-4 text-sm leading-relaxed'>
                  {feature.description}
                </p>
                <a
                  className='mt-auto inline-flex items-center gap-2 text-sm underline-offset-4 hover:underline'
                  href={feature.href}
                >
                  Read the guide <ArrowRight size={15} aria-hidden='true' />
                </a>
              </div>
            </article>
          ))}
        </section>
      </div>
    </>
  );
}
