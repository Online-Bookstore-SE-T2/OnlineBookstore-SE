import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  // Node-environment tests (e.g. theme checks) have no DOM to clean up.
  if (typeof window === 'undefined') return;
  cleanup();
  window.localStorage.clear();
});
