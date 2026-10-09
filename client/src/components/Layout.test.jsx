import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from '../App.jsx';

function renderApp(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>
  );
}

describe('application shell (SRS 3.1)', () => {
  it('header carries logo, search, cart indicator, account links and Help; footer carries contact and policy links', () => {
    renderApp('/');

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toBeInTheDocument();

    expect(
      screen.getByRole('link', { name: /cart/i })
    ).toBeInTheDocument();

    expect(
      screen.getByRole('link', { name: /log in/i })
    ).toBeInTheDocument();

    expect(
      screen.getByRole('link', { name: /register/i })
    ).toBeInTheDocument();

    expect(
      screen.getAllByRole('link', { name: /help/i }).length
    ).toBeGreaterThanOrEqual(1);

    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('pressing "/" focuses the search field', async () => {
    const user = userEvent.setup();

    renderApp('/');

    await user.keyboard('/');

    expect(screen.getByRole('searchbox')).toHaveFocus();
  });

  it('submitting a search navigates to the search route', async () => {
    const user = userEvent.setup();

    renderApp('/');

    await user.type(
      screen.getByRole('searchbox'),
      'Silent Orchard{Enter}'
    );

    expect(
      screen.getByRole('heading', { level: 1 })
    ).toHaveTextContent('Search Books');
  });

  it('privacy notice states what personal data is collected and why', () => {
    renderApp('/privacy');

    expect(
      screen.getByRole('heading', { level: 1 })
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        'This notice explains what personal data the bookstore collects and why.'
      )
    ).toBeInTheDocument();
  });

  it('unknown routes show a not-found page', () => {
    renderApp('/this-route-does-not-exist');

    expect(
      screen.getByRole('heading', { level: 1 })
    ).toHaveTextContent(/not found/i);
  });

  it('home, help and privacy screens have no accessibility violations', async () => {
    const { axe } = await import('vitest-axe');

    const { container, unmount } = renderApp('/');

    const homeResults = await axe(container);
    expect(homeResults.violations).toHaveLength(0);

    unmount();

    const help = renderApp('/help');

    const helpResults = await axe(help.container);
    expect(helpResults.violations).toHaveLength(0);

    help.unmount();

    const privacy = renderApp('/privacy');

    const privacyResults = await axe(privacy.container);
    expect(privacyResults.violations).toHaveLength(0);

    privacy.unmount();
  });
});