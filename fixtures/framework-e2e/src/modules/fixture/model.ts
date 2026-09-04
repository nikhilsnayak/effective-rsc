import { Schema } from 'effect';

export type FixtureGroup = 'primary' | 'secondary';

export type FixtureMetadata = {
  readonly description: string;
  readonly name: string;
  readonly revision: string;
  readonly runtime: string;
  readonly storage: string;
};

export type Item = {
  readonly category: 'Data' | 'Navigation' | 'Rendering';
  readonly description: string;
  readonly detailId: string;
  readonly id: string;
  readonly isSelected: boolean;
  readonly slot: string;
  readonly title: string;
};

export type Detail = {
  readonly description: string;
  readonly id: string;
  readonly label: string;
};

export type Catalog = {
  readonly description: string;
  readonly group: FixtureGroup;
  readonly items: ReadonlyArray<Item>;
  readonly label: string;
};

export type ItemDefinition = Omit<Item, 'isSelected'>;

export type CatalogDefinition = Omit<Catalog, 'items'> & {
  readonly items: ReadonlyArray<ItemDefinition>;
};

export type SelectionItem = Pick<Item, 'id' | 'slot' | 'title'> & {
  readonly groupLabel: string;
};

export type ObservedQuery<Value> = {
  readonly completedAt: number;
  readonly data: Value;
  readonly startedAt: number;
};

export class FixtureUnavailable extends Schema.TaggedError<FixtureUnavailable>()(
  '@effective-rsc/framework-e2e/fixture/FixtureUnavailable',
  { operation: Schema.String },
) {}
