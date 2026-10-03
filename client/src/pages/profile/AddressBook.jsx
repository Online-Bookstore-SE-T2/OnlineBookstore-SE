import { useState } from 'react';
import { apiRequest } from '../../api/http.js';
import Alert from '../../components/Alert.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import strings from '../../resources/strings.js';
import { LIMITS } from '../../validation/rules.js';
import AddressForm from './AddressForm.jsx';

// REQ-3: up to five delivery addresses, one of them the default.
export default function AddressBook({ addresses, readOnly, onChange }) {
  const [editing, setEditing] = useState(null); // null, 'new', or the address being edited
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const atLimit = addresses.length >= LIMITS.maxAddresses;

  function done(data, successMessage) {
    onChange(data.addresses);
    setMessage(successMessage);
    setError('');
  }

  async function saveAddress(fields) {
    const data =
      editing === 'new'
        ? await apiRequest('/users/me/addresses', { method: 'POST', body: fields })
        : await apiRequest(`/users/me/addresses/${editing.id}`, { method: 'PUT', body: fields });
    setEditing(null);
    done(data, strings.profile.addressSaved);
  }

  async function makeDefault(address) {
    setMessage('');
    try {
      done(await apiRequest(`/users/me/addresses/${address.id}/default`, { method: 'PATCH' }), strings.profile.defaultChanged);
    } catch (err) {
      setError(err.message);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    setMessage('');
    try {
      done(await apiRequest(`/users/me/addresses/${pendingDelete.id}`, { method: 'DELETE' }), strings.profile.addressDeleted);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  return (
    <section className="stack" aria-labelledby="addresses-heading">
      <h2 id="addresses-heading">{strings.profile.addressesHeading}</h2>
      <p className="muted">{strings.profile.addressesIntro(addresses.length, LIMITS.maxAddresses)}</p>
      <Alert type="error">{error}</Alert>
      <Alert>{message}</Alert>

      {addresses.length === 0 ? (
        <p>{strings.profile.noAddresses}</p>
      ) : (
        <ul className="stack plain-list">
          {addresses.map((address) => (
            <li key={address.id} className="card stack">
              <div className="row">
                <strong>{address.line}</strong>
                {address.isDefault && <span className="badge badge-strong">{strings.profile.defaultBadge}</span>}
              </div>
              <p className="muted">
                {address.city}, {address.state} {address.postalCode}
              </p>
              {!readOnly && (
                <div className="row">
                  <button type="button" className="btn btn-secondary btn-small" aria-label={strings.profile.editLabel(address.line)}
                    onClick={() => setEditing(address)}>
                    {strings.profile.edit}
                  </button>
                  {!address.isDefault && (
                    <button type="button" className="btn btn-secondary btn-small"
                      aria-label={strings.profile.makeDefaultLabel(address.line)} onClick={() => makeDefault(address)}>
                      {strings.profile.makeDefault}
                    </button>
                  )}
                  <button type="button" className="btn btn-secondary btn-small" aria-label={strings.profile.deleteLabel(address.line)}
                    onClick={() => setPendingDelete(address)}>
                    {strings.profile.delete}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <AddressForm
          key={editing === 'new' ? 'new' : editing.id}
          heading={editing === 'new' ? strings.profile.addAddressHeading : strings.profile.editAddressHeading}
          initial={editing === 'new' ? null : editing}
          showDefaultOption={editing === 'new' ? addresses.length > 0 : !editing.isDefault}
          onSubmit={saveAddress}
          onCancel={() => setEditing(null)}
        />
      ) : (
        !readOnly && (
          <div className="stack">
            {atLimit && <p className="muted">{strings.profile.addressLimitReached}</p>}
            <div>
              <button type="button" className="btn" disabled={atLimit} onClick={() => { setMessage(''); setEditing('new'); }}>
                {strings.profile.addAddress}
              </button>
            </div>
          </div>
        )
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={strings.profile.confirmDeleteTitle}
          message={strings.profile.confirmDeleteMessage(pendingDelete.line)}
          confirmLabel={strings.profile.confirmDelete}
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
}
