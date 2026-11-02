import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { PHOTOS } from '../../src/domain/photos.js';
import { groupByTheme, THEMES } from '../../src/web/themes.js';

const pkg = (code: string, ...tags: string[]) => ({ code, tags });

describe('groupByTheme', () => {
  test('puts each package in the first matching theme only, in theme order', () => {
    const groups = groupByTheme([pkg('A', 'beach', 'houseboat'), pkg('B', 'hills'), pkg('C', 'heritage', 'wildlife')]);
    assert.deepEqual(
      groups.map((g) => [g.theme?.id, g.items.map((i) => i.code)]),
      [['backwaters', ['A']], ['heritage', ['C']], ['hills', ['B']]],
    );
  });

  test('drops themes with no packages and keeps unmatched packages in a final group without a theme', () => {
    const groups = groupByTheme([pkg('X', 'karaoke'), pkg('Y')]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.theme, null);
    assert.deepEqual(groups[0]?.items.map((i) => i.code), ['X', 'Y']);
  });

  test('returns nothing for no packages', () => {
    assert.deepEqual(groupByTheme([]), []);
  });

  test('every theme names a photo that exists', () => {
    for (const theme of THEMES) assert.ok(theme.photo in PHOTOS, theme.id);
  });
});
