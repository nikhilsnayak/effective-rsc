import { describe, expect, it } from '@effect/vitest';

import { fixture } from '@/modules/fixture/data';
import type { SelectionItem } from '@/modules/fixture/model';
import { formatSelectionManifest } from '@/modules/selection/export';

const selection = [
  { groupLabel: 'Primary', id: 'document-stream', slot: 'P1', title: 'Document stream' },
  {
    groupLabel: 'Secondary',
    id: 'server-function-mutation',
    slot: 'S2',
    title: 'Server Function mutation',
  },
] satisfies ReadonlyArray<SelectionItem>;

describe('formatSelectionManifest', () => {
  it('encodes selected fixture items as a deterministic CSV manifest', () => {
    const manifest = formatSelectionManifest({
      fixture,
      generatedAt: '2026-09-04T02:30:00.000Z',
      selection,
    });

    expect(manifest).toContain('# ERSC Framework Fixture\n');
    expect(manifest).toContain('# revision=fixture-v1\n');
    expect(manifest).toContain('group,slot,id,title\n');
    expect(manifest).toContain('"Primary","P1","document-stream","Document stream"\n');
    expect(manifest).toContain(
      '"Secondary","S2","server-function-mutation","Server Function mutation"\n',
    );
  });

  it('produces a valid empty manifest', () => {
    const manifest = formatSelectionManifest({
      fixture,
      generatedAt: '2026-09-04T02:30:00.000Z',
      selection: [],
    });

    expect(manifest.endsWith('group,slot,id,title\n')).toBe(true);
  });
});
