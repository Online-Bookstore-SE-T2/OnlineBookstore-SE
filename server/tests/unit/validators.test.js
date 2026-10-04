const { FieldValidator, sanitizeText, isValidIsbn13, characterCount } = require('../../src/validation/validators');
const { stripOperatorKeys } = require('../../src/middleware/sanitize');

describe('common validation module', () => {
  test('sanitizeText strips markup, angle brackets and control characters', () => {
    expect(sanitizeText('<script>alert(1)</script>')).toBe('alert(1)');
    expect(sanitizeText('<img src=x onerror=alert(1)>')).toBe('');
    expect(sanitizeText('  Anita\u0000  Rao  ')).toBe('Anita Rao');
    expect(sanitizeText('a < b > c')).toBe('a c');
    expect(sanitizeText('5 > 3 and 2 < 4')).toBe('5 3 and 2 4');
  });

  test('characterCount counts code points so UTF-8 text is measured fairly', () => {
    expect(characterCount('Zoë Müller')).toBe(10);
    expect(characterCount('ಕನ್ನಡ')).toBe(5);
  });

  test('isValidIsbn13 checks length, digits and the check digit', () => {
    expect(isValidIsbn13('9789380000107')).toBe(true);
    expect(isValidIsbn13('9789380000108')).toBe(false);
    expect(isValidIsbn13('0306406152')).toBe(false);
    expect(isValidIsbn13('978938000010X')).toBe(false);
    expect(isValidIsbn13(9789380000107)).toBe(false);
  });

  test('text enforces required, type and maximum length', () => {
    const v = new FieldValidator();
    expect(v.text('a', 'A'.repeat(60), { label: 'Name', required: true, max: 60 })).toHaveLength(60);
    expect(v.text('b', 'A'.repeat(61), { label: 'Name', required: true, max: 60 })).toBeUndefined();
    expect(v.text('c', '   ', { label: 'Name', required: true })).toBeUndefined();
    expect(v.text('d', 42, { label: 'Name' })).toBeUndefined();
    expect(v.text('e', '', { label: 'Note' })).toBe('');
    expect(v.text('f', undefined, { label: 'Note' })).toBeUndefined();
    expect(Object.keys(v.errors)).toEqual(['b', 'c', 'd']);
    expect(() => v.throwIfInvalid()).toThrow(expect.objectContaining({ status: 400 }));
  });

  test('email normalises case and rejects malformed or over-long addresses', () => {
    const v = new FieldValidator();
    expect(v.email('ok', '  Divya.Kamath@TestMail.example ')).toBe('divya.kamath@testmail.example');
    ['divya.kamath.testmail.example', 'divya@', '@testmail.example'].forEach((bad, i) => {
      expect(v.email(`bad${i}`, bad)).toBeUndefined();
    });
    const local83 = 'a'.repeat(83);
    expect(v.email('max', `${local83}@testmail.example`)).toHaveLength(100);
    expect(v.email('over', `a${local83}@testmail.example`)).toBeUndefined();
    expect(v.email('obj', { $ne: null })).toBeUndefined();
    expect(v.email('empty', '')).toBeUndefined();
  });

  test('password is mandatory, must be text and is never altered', () => {
    const v = new FieldValidator();
    expect(v.password('p', ' BookTest#2026 ')).toBe(' BookTest#2026 ');
    expect(v.password('q', '')).toBeUndefined();
    expect(v.password('r', { $ne: null })).toBeUndefined();
    expect(Object.keys(v.errors)).toEqual(['q', 'r']);
  });

  test('phone requires exactly 10 digits', () => {
    const v = new FieldValidator();
    expect(v.phone('a', '9000000021')).toBe('9000000021');
    expect(v.phone('b', '90000000211')).toBeUndefined();
    expect(v.phone('c', '90000abc21')).toBeUndefined();
    expect(v.phone('d', '900000002')).toBeUndefined();
    expect(v.phone('e', '')).toBe('');
    expect(v.phone('f', undefined)).toBeUndefined();
    expect(Object.keys(v.errors)).toEqual(['b', 'c', 'd']);
  });

  test('postal code requires exactly 6 digits', () => {
    const v = new FieldValidator();
    expect(v.postalCode('a', '560011')).toBe('560011');
    expect(v.postalCode('b', '5600111')).toBeUndefined();
    expect(v.postalCode('c', '56A011')).toBeUndefined();
    expect(v.postalCode('d', '56001')).toBeUndefined();
    expect(Object.keys(v.errors)).toEqual(['b', 'c', 'd']);
  });

  test('oneOf accepts only listed values', () => {
    const v = new FieldValidator();
    expect(v.oneOf('a', 'INCD', ['INCD', 'OTHR'], { label: 'Code' })).toBe('INCD');
    expect(v.oneOf('b', 'XXXX', ['INCD'], { label: 'Code' })).toBeUndefined();
    expect(v.oneOf('c', undefined, ['INCD'], { label: 'Code' })).toBeUndefined();
    expect(Object.keys(v.errors)).toEqual(['b', 'c']);
  });
});

describe('request sanitiser', () => {
  test('removes operator and dotted keys at any depth', () => {
    const body = { email: { $ne: null }, nested: [{ 'a.b': 1, ok: 2 }], $where: 'x' };
    expect(stripOperatorKeys(body)).toEqual({ email: {}, nested: [{ ok: 2 }] });
  });
});
