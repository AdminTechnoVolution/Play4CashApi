import {
  normalizeLanguageField,
  normalizeOptionalLanguageField,
  pickLocalizedField,
  toAdminLanguageField,
} from './tournament-language.util';

describe('tournament-language.util', () => {
  it('normalizes title from string or partial object', () => {
    const fromString = normalizeLanguageField('Hello Cup', 'TITLE');
    expect(fromString.en).toBe('Hello Cup');
    expect(fromString.es).toBe('Hello Cup');

    const fromPartial = normalizeLanguageField({ en: 'Cup', es: 'Copa' }, 'TITLE');
    expect(fromPartial.en).toBe('Cup');
    expect(fromPartial.es).toBe('Copa');
    expect(fromPartial.fr).toBe('Cup');
  });

  it('allows empty optional description', () => {
    const empty = normalizeOptionalLanguageField(undefined);
    expect(empty.en).toBe('');
    const filled = normalizeOptionalLanguageField({ en: 'Rules', es: 'Reglas' });
    expect(filled.es).toBe('Reglas');
  });

  it('pickLocalizedField supports legacy string storage', () => {
    expect(pickLocalizedField('Legacy', 'es')).toBe('Legacy');
    expect(
      pickLocalizedField({ en: 'EN', es: 'ES', fr: 'FR', de: 'DE', it: 'IT', pt: 'PT' }, 'es'),
    ).toBe('ES');
  });

  it('toAdminLanguageField migrates legacy string to full object', () => {
    const field = toAdminLanguageField('Old title', 'TITLE');
    expect(field.en).toBe('Old title');
    expect(field.pt).toBe('Old title');
  });
});
