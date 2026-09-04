import type { FixtureMetadata, SelectionItem } from '@/modules/fixture/model';

type SelectionManifestOptions = {
  readonly fixture: FixtureMetadata;
  readonly generatedAt: string;
  readonly selection: ReadonlyArray<SelectionItem>;
};

const escapeField = (value: string) => JSON.stringify(value);

export function formatSelectionManifest({
  fixture,
  generatedAt,
  selection,
}: SelectionManifestOptions) {
  const rows = selection.map((item) =>
    [item.groupLabel, item.slot, item.id, item.title].map(escapeField).join(','),
  );

  return `${[
    `# ${fixture.name}`,
    `# revision=${fixture.revision}`,
    `# generated-at=${generatedAt}`,
    'group,slot,id,title',
    ...rows,
  ].join('\n')}\n`;
}
