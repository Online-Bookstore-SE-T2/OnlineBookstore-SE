import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/render.jsx';
import { axeViolations } from '../test/a11y.js';

describe('application shell (SRS 3.1)', () => {
  test('header carries logo, search, cart indicator, account links and Help; footer carries contact and policy links', () => {
    renderApp('/');
    const header = screen.getByRole('banner');
    expect(header).toHaveTextContent('Online Bookstore');
    expect(screen.getByRole('searchbox', { name: /search books/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cart, 0 items' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Help' }).length).toBeGreaterThan(0);
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent('Contact');
    expect(footer).toHaveTextContent('Privacy notice');
  });

  test('pressing "/" focuses the search field', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.keyboard('/');
    const search = screen.getByRole('searchbox');
    expect(search).toHaveFocus();
    await user.keyboard('orchard');
    expect(search).toHaveValue('orchard');
  });

  test('submitting a search navigates to the search route', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.type(screen.getByRole('searchbox'), 'Silent Orchard{Enter}');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Search is not available yet');
  });

  test('privacy notice states what personal data is collected and why', () => {
    renderApp('/privacy');
    expect(screen.getByRole('heading', { name: 'What we collect' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Why we collect it' })).toBeInTheDocument();
  });

  test('unknown routes show a not-found page', () => {
    renderApp('/nowhere');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  test('home, help and privacy screens have no accessibility violations', async () => {
    for (const path of ['/', '/help', '/privacy']) {
      const { container, unmount } = renderApp(path);
      expect(await axeViolations(container)).toEqual([]);
      unmount();
    }
  });
});
