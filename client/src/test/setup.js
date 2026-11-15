import * as matchers from '@testing-library/jest-dom/matchers';
import { afterEach, expect } from 'vitest';
import { cleanup } from '@testing-library/react';

expect.extend(matchers);

afterEach(() => {
  // Node-environment tests (e.g. theme checks) have no DOM to clean up.
  if (typeof window === 'undefined') return;

  cleanup();
  window.localStorage.clear();
});
