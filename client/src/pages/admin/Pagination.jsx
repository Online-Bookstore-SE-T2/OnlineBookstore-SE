import strings from '../../resources/strings.js';

export default function Pagination({ page, totalPages, total, onPage }) {
  return (
    <nav className="row" aria-label="Pagination">
      <button type="button" className="btn btn-secondary btn-small" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {strings.admin.previous}
      </button>
      <span role="status">{strings.admin.pageStatus(page, totalPages, total)}</span>
      <button type="button" className="btn btn-secondary btn-small" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        {strings.admin.next}
      </button>
    </nav>
  );
}
