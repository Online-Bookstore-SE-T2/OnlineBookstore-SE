// Timestamps are stored and sent in ISO 8601 UTC (SRS 2.5); they are shown as UTC dates.
export function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// Monetary values are INR to two decimal places (SRS 2.5, 6.5).
export function formatINR(amount) {
  if (typeof amount !== 'number') return '';
  return `₹${amount.toFixed(2)}`;
}

export function formatDateTime(iso) {
  if (!iso) return '';
  return `${new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })} UTC`;
}
