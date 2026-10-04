import { useState } from 'react';
import { apiRequest } from '../../api/http.js';
import Alert from '../../components/Alert.jsx';
import FormField from '../../components/FormField.jsx';
import strings from '../../resources/strings.js';
import { focusFirstError, showApiError } from '../../utils/forms.js';
import { validateProfile } from '../../validation/rules.js';

const FIELD_ORDER = ['name', 'email', 'phone'];
const idFor = (field) => `profile-${field}`;

// REQ-3: view and update name, e-mail address and phone number.
export default function ProfileDetailsForm({ user, readOnly, onSaved }) {
  const [values, setValues] = useState({ name: user.name, email: user.email, phone: user.phone || '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const setField = (field) => (event) => setValues((prev) => ({ ...prev, [field]: event.target.value }));

  async function onSubmit(event) {
    event.preventDefault();
    setFormError('');
    setMessage('');
    const clientErrors = validateProfile(values);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) {
      focusFirstError(clientErrors, FIELD_ORDER, idFor);
      return;
    }
    setSaving(true);
    try {
      const data = await apiRequest('/users/me', {
        method: 'PATCH',
        body: { name: values.name, email: values.email, phone: values.phone.trim() },
      });
      onSaved(data.user);
      setMessage(strings.profile.detailsSaved);
    } catch (err) {
      showApiError(err, { setErrors, setFormError, fieldOrder: FIELD_ORDER, idFor });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card stack" onSubmit={onSubmit} noValidate aria-labelledby="profile-details-heading">
      <h2 id="profile-details-heading">{strings.profile.detailsHeading}</h2>
      <Alert type="error">{formError}</Alert>
      <Alert>{message}</Alert>
      <FormField id={idFor('name')} label={strings.fields.name} required autoComplete="name" error={errors.name}
        value={values.name} onChange={setField('name')} readOnly={readOnly} />
      <FormField id={idFor('email')} label={strings.fields.email} required type="email" autoComplete="email"
        error={errors.email} value={values.email} onChange={setField('email')} readOnly={readOnly} />
      <FormField id={idFor('phone')} label={strings.fields.phone} type="tel" inputMode="numeric" autoComplete="tel-national"
        hint={strings.profile.phoneHint} error={errors.phone} value={values.phone} onChange={setField('phone')} readOnly={readOnly} />
      <div>
        <button className="btn" type="submit" disabled={saving || readOnly}>
          {saving ? strings.forms.saving : strings.profile.saveDetails}
        </button>
      </div>
    </form>
  );
}
