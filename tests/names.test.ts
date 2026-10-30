import { describe, it, expect } from 'vitest';
import { pigeonName, bottleName, isValidName, TITLES, NAMES } from '../shared/names';

describe('carrier names', () => {
  it('has at least 30 titles and 150 names, no duplicates', () => {
    expect(TITLES.length).toBeGreaterThanOrEqual(30);
    expect(NAMES.length).toBeGreaterThanOrEqual(150);
    expect(new Set(NAMES).size).toBe(NAMES.length);
  });

  it('generates names that pass validation and avoid names in the air', () => {
    for (let i = 0; i < 500; i++) {
      expect(isValidName(pigeonName(), 'pigeon')).toBe(true);
      expect(isValidName(bottleName(), 'bottle')).toBe(true);
    }
    const taken = new Set(['Sir Pickles']);
    for (let i = 0; i < 200; i++) expect(pigeonName(taken)).not.toBe('Sir Pickles');
  });

  it('rejects anything not built from the lists', () => {
    expect(isValidName('Sir Pickles', 'pigeon')).toBe(true);
    expect(isValidName('Countess Pom Pom', 'pigeon')).toBe(true);
    expect(isValidName('Sir Poopyhead', 'pigeon')).toBe(false);
    expect(isValidName('Pickles', 'pigeon')).toBe(false);
    expect(isValidName('Sir Pickles <script>', 'pigeon')).toBe(false);
    expect(isValidName('The S.S. Biscuit', 'bottle')).toBe(true);
    expect(isValidName('Bottle No. 412', 'bottle')).toBe(true);
    expect(isValidName('Bottle No. 0412', 'bottle')).toBe(false);
    expect(isValidName('The S.S. Biscuit', 'pigeon')).toBe(false);
  });
});
