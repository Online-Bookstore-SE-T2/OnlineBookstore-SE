import axe from 'axe-core';

// Runs axe-core against a rendered container and returns the violations (SRS 6.4 / NFR11).
// Colour contrast is checked separately because jsdom does not compute styles.
export async function axeViolations(container) {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((violation) => ({
    id: violation.id,
    nodes: violation.nodes.map((node) => node.html),
  }));
}
