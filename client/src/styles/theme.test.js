// @vitest-environment node
// TC-NFR-QUA-16 (NFR11) and the monochrome theme: contrast of every text/background pair used
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

const isGrey = (hex) => hex.slice(1, 3) === hex.slice(3, 5) && hex.slice(3, 5) === hex.slice(5, 7);

describe('monochrome theme', () => {
  test('defines at least seven shades of grey from white to black', () => {
    const greys = Object.entries(tokens).filter(([name]) => name.startsWith('gray-'));
    expect(greys.length).toBeGreaterThanOrEqual(7);
    expect(greys.every(([, hex]) => isGrey(hex))).toBe(true);
    expect(tokens['gray-0'].toLowerCase()).toBe('#ffffff');
    expect(tokens['gray-9']).toBe('#000000');
  });

  test('the only colour is the error red required by SRS 3.1', () => {
    const coloured = Object.entries(tokens).filter(([, hex]) => !isGrey(hex));
    expect(coloured.map(([name]) => name)).toEqual(['error']);
  });

  test.each([
    ['body text', 'gray-7', 'gray-0'],
    ['secondary text', 'gray-5', 'gray-0'],
    ['secondary text on surfaces', 'gray-5', 'gray-1'],
    ['headings and labels', 'gray-9', 'gray-0'],
    ['table headers', 'gray-9', 'gray-1'],
    ['primary button', 'gray-0', 'gray-9'],
    ['primary button hover', 'gray-0', 'gray-6'],
    ['header text', 'gray-0', 'gray-8'],
    ['footer text', 'gray-2', 'gray-8'],
    ['validation errors', 'error', 'gray-0'],
    ['error alert', 'error', 'gray-1'],
  ])('%s meet 4.5:1 (%s on %s)', (_label, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  test('input borders meet the 3:1 non-text contrast ratio', () => {
    expect(contrast('gray-4', 'gray-0')).toBeGreaterThanOrEqual(3);
  });

  test('the layout switches to a single column below 768 px (SRS 3.1)', () => {
    expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*\.grid-2\s*{\s*grid-template-columns: minmax\(0, 1fr\);/);
  });

  test('keyboard focus is always visible', () => {
    expect(css).toMatch(/:focus-visible\s*{\s*outline: 3px solid var\(--gray-9\)/);
  });
});
