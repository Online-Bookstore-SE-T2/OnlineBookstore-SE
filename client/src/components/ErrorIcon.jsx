// Icon shown beside every error so errors are never conveyed by colour alone (SRS 3.1).
export default function ErrorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="7" y="3.5" width="2" height="6" fill="currentColor" />
      <rect x="7" y="11" width="2" height="2" fill="currentColor" />
    </svg>
  );
}
