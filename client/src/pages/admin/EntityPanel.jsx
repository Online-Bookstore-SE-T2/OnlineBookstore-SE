import { useEffect, useId, useState } from 'react';
import { apiRequest } from '../../api/http.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import Alert from '../../components/Alert.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import FormField from '../../components/FormField.jsx';
import strings from '../../resources/strings.js';
import { formatDate } from '../../utils/format.js';
import Pagination from './Pagination.jsx';
import RecordDetails from './RecordDetails.jsx';

function defaultLoad(config, { page, q, deleted, filters }) {
  return apiRequest(`/admin/${config.entity}/query`, {
    method: 'POST',
    body: { page, deleted, ...(q && { q }), ...config.fixedFilters, ...filters },
  });
}

const restoreAction = {
  key: 'restore',
  label: strings.admin.restore,
  run: (row, _input, config) => apiRequest(`/admin/${config.entity}/${row.id}/restore`, { method: 'POST' }),
};

// The input an action's dialog collects (a new name or a rejection reason).
function ActionInput({ form, value, onChange, error }) {
  if (form.type === 'select') {
    return (
      <FormField id="action-input" as="select" label={form.label} required error={error} value={value}
        onChange={(event) => onChange(event.target.value)}>
        <option value="">-</option>
        {form.options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </FormField>
    );
  }
  return (
    <FormField id="action-input" label={form.label} required error={error} value={value}
      onChange={(event) => onChange(event.target.value)} />
  );
}

// One administration section: a paginated, searchable table of records with row actions
// (REQ-4). Driven entirely by `config` (see entityConfigs.jsx).
export default function EntityPanel({ config }) {
  const { user } = useAuth();
  const searchId = useId();
  const [deleted, setDeleted] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [pending, setPending] = useState(null);
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = config.load ? config.load({ page }) : defaultLoad(config, { page, q, deleted, filters });
    load
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLoadError('');
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, page, q, deleted, filters, reloadKey]);

  const reload = () => setReloadKey((key) => key + 1);
  const ctx = { currentUserId: user.id };

  function changeQuery(update) {
    setPage(1);
    update();
  }

  async function runAction(action, row, value) {
    setBusy(true);
    setActionError('');
    setMessage('');
    try {
      await action.run(row, value, config);
      setPending(null);
      setMessage(strings.admin.done);
      reload();
    } catch (err) {
      if (action.form) {
        setInputError(err.fields?.[action.form.field] || err.message);
      } else {
        setPending(null);
        setActionError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  function startAction(action, row) {
    if (action.confirm || action.form) {
      setInput(action.form?.initial ? action.form.initial(row) : '');
      setInputError('');
      setPending({ action, row });
    } else {
      runAction(action, row);
    }
  }

  function confirmPending() {
    const { action, row } = pending;
    if (action.form && !input.trim()) {
      setInputError(action.form.requiredMessage);
      return;
    }
    runAction(action, row, input);
  }

  async function view(row) {
    setActionError('');
    try {
      const result = await apiRequest(`/admin/${config.entity}/${row.id}`);
      setViewing(result.record);
    } catch (err) {
      setActionError(err.message);
    }
  }

  const rowActions = (row) => {
    if (deleted) return [restoreAction];
    return (config.actions || []).filter((action) => !action.visible || action.visible(row, ctx));
  };

  const columns = deleted
    ? [...config.columns, { key: 'deletedAt', label: strings.admin.deletedOn, render: (row) => formatDate(row.deletedAt) }]
    : config.columns;
  const hasActions = config.viewable !== false || (config.actions || []).length > 0 || deleted;

  return (
    <div className="stack">
      {config.toolbar && config.toolbar({ onDone: () => { setMessage(strings.admin.done); reload(); } })}

      {(config.searchable || config.filters || config.restorable) && (
        <div className="row">
          {config.searchable && (
            <form className="row" role="search" aria-label={strings.admin.searchLabel(config.title.toLowerCase())} onSubmit={(event) => { event.preventDefault(); changeQuery(() => setQ(searchInput.trim())); }}>
              <label htmlFor={searchId} className="visually-hidden">
                {strings.admin.searchLabel(config.title.toLowerCase())}
              </label>
              <input id={searchId} type="search" className="input" value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)} placeholder={strings.admin.searchLabel(config.title.toLowerCase())} />
              <button type="submit" className="btn btn-secondary btn-small">{strings.admin.search}</button>
            </form>
          )}
          {(config.filters || []).map((filter) => (
            <label key={filter.name} className="row">
              <span>{filter.label}</span>
              <select className="input" value={filters[filter.name] || ''}
                onChange={(event) => changeQuery(() => setFilters((prev) => ({ ...prev, [filter.name]: event.target.value || undefined })))}>
                <option value="">{strings.admin.filterAll}</option>
                {filter.options.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          ))}
          {config.restorable && (
            <label className="checkbox-field">
              <input type="checkbox" checked={deleted} onChange={(event) => changeQuery(() => setDeleted(event.target.checked))} />
              <span>{strings.admin.showDeleted}</span>
            </label>
          )}
        </div>
      )}

      <Alert type="error">{loadError || actionError}</Alert>
      <Alert>{message}</Alert>

      {!data ? (
        !loadError && <p role="status">{strings.admin.loading}</p>
      ) : data.items.length === 0 ? (
        <p>{config.emptyMessage || strings.admin.empty}</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">{config.title}</caption>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} scope="col">{column.label}</th>
                  ))}
                  {hasActions && <th scope="col">{strings.admin.actions}</th>}
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.id}>
                    {columns.map((column) => (
                      <td key={column.key}>{column.render(row, ctx)}</td>
                    ))}
                    {hasActions && (
                      <td>
                        <div className="row">
                          {config.viewable !== false && (
                            <button type="button" className="btn btn-secondary btn-small"
                              aria-label={strings.admin.actionLabel(strings.admin.view, config.label(row))} onClick={() => view(row)}>
                              {strings.admin.view}
                            </button>
                          )}
                          {rowActions(row).map((action) => (
                            <button key={action.key} type="button" className="btn btn-secondary btn-small"
                              aria-label={strings.admin.actionLabel(action.label, config.label(row))}
                              onClick={() => startAction(action, row)} disabled={busy}>
                              {action.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
        </>
      )}

      {pending && (
        <ConfirmDialog
          title={pending.action.confirm ? pending.action.confirm(pending.row).title : pending.action.form.title}
          message={pending.action.confirm ? pending.action.confirm(pending.row).message : undefined}
          confirmLabel={pending.action.label}
          busy={busy}
          onConfirm={confirmPending}
          onCancel={() => setPending(null)}
        >
          {pending.action.form && (
            <ActionInput form={pending.action.form} value={input} onChange={setInput} error={inputError} />
          )}
        </ConfirmDialog>
      )}

      {viewing && <RecordDetails record={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
