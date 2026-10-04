import { useState } from 'react';
import { apiRequest } from '../../api/http.js';
import Alert from '../../components/Alert.jsx';
import FormField from '../../components/FormField.jsx';
import strings from '../../resources/strings.js';
import { formatDate } from '../../utils/format.js';
import { LIMITS, optionalText } from '../../validation/rules.js';

// A Buyer asks to become a Seller; an administrator approves or rejects the request.
export default function SellerRequestCard({ user, readOnly, onSaved }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const request = user.sellerRequest || { status: 'None' };

  async function onSubmit(event) {
    event.preventDefault();
    setFormError('');
    const clientError = optionalText(note, strings.sellerRequest.noteLabel, LIMITS.sellerRequestNote);
    setError(clientError || '');
    if (clientError) return;
    setSaving(true);
    try {
      const data = await apiRequest('/users/me/seller-request', { method: 'POST', body: note.trim() ? { note } : {} });
      onSaved(data.user);
      setMessage(strings.sellerRequest.submitted);
    } catch (err) {
      setError(err.fields?.note || '');
      setFormError(err.fields?.note ? '' : err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card stack" aria-labelledby="seller-request-heading">
      <h2 id="seller-request-heading">{strings.sellerRequest.heading}</h2>
      <p className="muted">{strings.sellerRequest.intro}</p>
      <Alert type="error">{formError}</Alert>
      <Alert>{message}</Alert>
      {request.status === 'Pending' ? (
        !message && <Alert>{strings.sellerRequest.pending(formatDate(request.requestedAt))}</Alert>
      ) : (
        <>
          {request.status === 'Rejected' && (
            <p>{strings.sellerRequest.rejected(strings.rejectReasons[user.rejectReasonCode] || user.rejectReasonCode)}</p>
          )}
          <form className="stack" onSubmit={onSubmit} noValidate>
            <FormField id="seller-note" as="textarea" rows={2} label={strings.sellerRequest.noteLabel}
              hint={strings.sellerRequest.noteHint} error={error} value={note}
              onChange={(event) => setNote(event.target.value)} readOnly={readOnly} />
            <div>
              <button type="submit" className="btn" disabled={saving || readOnly}>
                {strings.sellerRequest.submit}
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
