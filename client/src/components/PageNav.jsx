// Previous / Next pager for book result lists.
export default function PageNav({ label, page, totalPages, disabled = false, onPage }) {
  return (
    <nav className="page-nav" aria-label={label}>
      <button type="button" disabled={page <= 1 || disabled} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span className="page-nav-status">Page {page} of {totalPages}</span>
      <button type="button" disabled={page >= totalPages || disabled} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </nav>
  );
}
