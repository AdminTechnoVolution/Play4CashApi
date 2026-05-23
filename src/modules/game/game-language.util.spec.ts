import { normalizeLanguageField, normalizeRulesField } from './game-language.util';

describe('game-language.util', () => {
  it('normalizes a plain string into all locales', () => {
    const field = normalizeLanguageField('Hello', 'NAME');
    expect(field.en).toBe('Hello');
    expect(field.es).toBe('Hello');
    expect(field.fr).toBe('Hello');
  });

  it('fills missing locales from en/es fallback', () => {
    const field = normalizeLanguageField({ en: 'Chess', es: 'Ajedrez' }, 'NAME');
    expect(field.en).toBe('Chess');
    expect(field.es).toBe('Ajedrez');
    expect(field.fr).toBe('Chess');
  });

  it('normalizes rules array', () => {
    const rules = normalizeRulesField([{ en: 'Rule A' }, { es: 'Regla B', en: 'Rule B' }]);
    expect(rules).toHaveLength(2);
    expect(rules[0].en).toBe('Rule A');
    expect(rules[1].es).toBe('Regla B');
  });
});
