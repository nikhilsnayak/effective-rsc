import { BunServices } from '@effect/platform-bun';
import { Context, Effect, FileSystem, Layer, Option, Path, Schema, SchemaGetter } from 'effect';

import { DocumentationError, indexDocuments, readDocument } from './files';
import { DocEntry } from './model';

export class Docs extends Context.Service<Docs>()('site/docs/Docs', {
  make: Effect.gen(function* () {
    const path = yield* Path.Path;
    // Public assets are copied intact by the deployment adapter, including these source files.
    const root = path.resolve('public/generated/docs');
    const entries = yield* indexDocuments(root);
    const services = yield* Effect.context<FileSystem.FileSystem | Path.Path>();
    return {
      entries,
      read: (entry: DocEntry) => readDocument(root, entry).pipe(Effect.provide(services)),
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(BunServices.layer));
}

export const readRequiredDocument = Effect.fnUntraced(function* (href: string) {
  const docs = yield* Docs;
  const entry = docs.entries.find((entry) => entry.href === href);
  if (entry === undefined) {
    return yield* new DocumentationError({ message: `Missing required documentation: ${href}` });
  }
  return yield* docs.read(entry);
});

// A missing document fails parameter decoding, so both HTML and Flight return the native 404.
export const resolveDocument = <S extends Schema.Constraint>(
  paramsSchema: S,
  toHref: (params: S['Type']) => string,
) =>
  Schema.decodeTo<typeof DocEntry, S, Docs>(DocEntry, {
    decode: new SchemaGetter.Getter((input: Option.Option<S['Type']>) =>
      Effect.map(Docs, ({ entries }) =>
        Option.flatMap(input, (params) =>
          Option.fromNullishOr(entries.find((entry) => entry.href === toHref(params))),
        ),
      ),
    ),
    encode: SchemaGetter.forbidden(() => 'Documentation parameters are decode-only.'),
  })(paramsSchema);
