// @vitest-environment node
// TC-NFR-QUA-16 (NFR11) and the neobrutalist theme: contrast of every text/background pair used
// by the interface, computed from the colour tokens in global.css (WCAG 2.1 formula).
import fs from 'node:fs';

const css = fs.readFileSync(new URL('./global.css', import.meta.url), 'utf8');
const tokens = Object.fromEntries([...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map(([, name, hex]) => [name, hex]));

function luminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [light, dark] = [luminance(tokens[a]), luminance(tokens[b])].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

function hue(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) return null;
  const h = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (h * 60 + 360) % 360;
}

const isGrey = (hex) => hex.slice(1, 3) === hex.slice(3, 5) && hex.slice(3, 5) === hex.slice(5, 7);
const isRed = (hex) => {
  const h = hue(hex);
  return h !== null && (h < 15 || h > 345);
};
const brand = Object.keys(tokens).filter((name) => name.startsWith('brand-'));

describe('neobrutalist theme', () => {
  test('defines at least seven shades of grey from white to black', () => {
    const greys = Object.entries(tokens).filter(([name]) => name.startsWith('gray-'));
    expect(greys.length).toBeGreaterThanOrEqual(7);
    expect(greys.every(([, hex]) => isGrey(hex))).toBe(true);
    expect(tokens['gray-0'].toLowerCase()).toBe('#ffffff');
    expect(tokens['gray-9']).toBe('#000000');
  });

  test('colours other than grey are the error red, the brand accents and the four admin action tones', () => {
    const coloured = Object.entries(tokens).filter(([, hex]) => !isGrey(hex)).map(([name]) => name);
    expect(coloured.filter((name) => !name.startsWith('brand-'))).toEqual([
      'error', 'action-info', 'action-positive', 'action-caution', 'action-danger',
    ]);
  });

  test('brand accents never use red, which marks errors (SRS 3.1) and destructive actions', () => {
    expect(isRed(tokens.error)).toBe(true);
    expect(brand.filter((name) => isRed(tokens[name]))).toEqual([]);
  });

  test('every brand accent carries black text at 4.5:1 or better', () => {
    expect(brand.length).toBeGreaterThan(0);
    brand.forEach((name) => expect(contrast('gray-9', name)).toBeGreaterThanOrEqual(4.5));
  });

  // Tone text and borders on white and table-row surfaces; white text when filled on hover.
  test.each(['action-info', 'action-positive', 'action-caution', 'action-danger'])(
    '%s meets 4.5:1 on white and on surfaces, and under white text',
    (tone) => {
      expect(contrast(tone, 'gray-0')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tone, 'gray-1')).toBeGreaterThanOrEqual(4.5);
    },
  );

  test.each([
    ['body text', 'gray-7', 'gray-0'],
    ['body text on the page', 'gray-7', 'brand-paper'],
    ['secondary text', 'gray-5', 'gray-0'],
    ['secondary text on the page', 'gray-5', 'brand-paper'],
    ['secondary text on surfaces', 'gray-5', 'gray-1'],
    ['secondary text in the header', 'gray-5', 'brand-yellow'],
    ['headings and labels', 'gray-9', 'brand-paper'],
    ['primary button', 'gray-9', 'brand-yellow'],
    ['dark button', 'gray-0', 'gray-9'],
    ['dark button hover', 'gray-0', 'gray-6'],
    ['disabled button', 'gray-5', 'gray-1'],
    ['status message', 'gray-9', 'brand-mint'],
    ['table headers', 'gray-9', 'brand-lilac'],
    ['footer text', 'gray-2', 'gray-8'],
    ['footer links', 'brand-yellow', 'gray-8'],
    ['validation errors', 'error', 'gray-0'],
    ['validation errors on the page', 'error', 'brand-paper'],
  ])('%s meet 4.5:1 (%s on %s)', (_label, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  test('strokes around inputs and cards meet the 3:1 non-text contrast ratio', () => {
    expect(contrast('gray-9', 'gray-0')).toBeGreaterThanOrEqual(3);
    expect(contrast('gray-9', 'brand-paper')).toBeGreaterThanOrEqual(3);
    expect(css).toMatch(/input:not\(\[type='checkbox'\]\)[^{]*{[^}]*border: var\(--stroke-thin\) solid var\(--gray-9\)/);
  });

  test('the layout switches to a single column below 768 px (SRS 3.1)', () => {
    expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*\.grid-2\s*{\s*grid-template-columns: minmax\(0, 1fr\);/);
  });

  test('keyboard focus is always visible', () => {
    expect(css).toMatch(/:focus-visible\s*{\s*outline: 3px solid var\(--gray-9\)/);
  });

  test('motion is switched off for visitors who ask for reduced motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});
