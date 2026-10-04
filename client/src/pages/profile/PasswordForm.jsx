import { useState } from 'react';
import { apiRequest } from '../../api/http.js';
import Alert from '../../components/Alert.jsx';
import FormField from '../../components/FormField.jsx';
import strings from '../../resources/strings.js';
import { focusFirstError, showApiError } from '../../utils/forms.js';
import { validatePasswordChange } from '../../validation/rules.js';

const FIELD_ORDER = ['currentPassword', 'newPassword'];
const idFor = (field) => `password-${field}`;
const EMPTY = { currentPassword: '', newPassword: '' };

// REQ-3: change password after confirming the current one.
export default function PasswordForm({ readOnly }) {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const setField = (field) => (event) => setValues((prev) => ({ ...prev, [field]: event.target.value }));

  async function onSubmit(event) {
    event.preventDefault();
    setFormError('');
    setMessage('');
    const clientErrors = validatePasswordChange(values);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) {
      focusFirstError(clientErrors, FIELD_ORDER, idFor);
      return;
    }
    setSaving(true);
    try {
      await apiRequest('/users/me/password', { method: 'PUT', body: values });
      setValues(EMPTY);
      setMessage(strings.profile.passwordChanged);
    } catch (err) {
      showApiError(err, { setErrors, setFormError, fieldOrder: FIELD_ORDER, idFor });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card stack" onSubmit={onSubmit} noValidate aria-labelledby="password-heading">
      <h2 id="password-heading">{strings.profile.passwordHeading}</h2>
      <Alert type="error">{formError}</Alert>
      <Alert>{message}</Alert>
      <FormField id={idFor('currentPassword')} label={strings.fields.currentPassword} required type="password"
        autoComplete="current-password" error={errors.currentPassword} value={values.currentPassword}
        onChange={setField('currentPassword')} readOnly={readOnly} />
      <FormField id={idFor('newPassword')} label={strings.fields.newPassword} required type="password"
        autoComplete="new-password" error={errors.newPassword} value={values.newPassword}
        onChange={setField('newPassword')} readOnly={readOnly} />
      <div>
        <button className="btn" type="submit" disabled={saving || readOnly}>
          {saving ? strings.forms.saving : strings.profile.changePassword}
        </button>
      </div>
    </form>
  );
}
