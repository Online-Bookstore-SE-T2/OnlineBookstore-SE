import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App.jsx';

// Renders the whole application at a given URL.
export function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
