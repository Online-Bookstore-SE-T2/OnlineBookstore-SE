import { useState } from 'react';
import Alert from '../../components/Alert.jsx';
import FormField from '../../components/FormField.jsx';
import strings from '../../resources/strings.js';
import { focusFirstError, showApiError } from '../../utils/forms.js';
import { address as validateAddress } from '../../validation/rules.js';

const FIELD_ORDER = ['line', 'city', 'state', 'postalCode'];
const idFor = (field) => `address-${field}`;
const EMPTY = { line: '', city: '', state: '', postalCode: '' };

// Add or edit one delivery address (REQ-3). `onSubmit` resolves on success or throws an ApiError.
export default function AddressForm({ heading, initial, showDefaultOption, onSubmit, onCancel }) {
  const [values, setValues] = useState(initial ? { ...EMPTY, ...initial } : EMPTY);
  const [makeDefault, setMakeDefault] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const setField = (field) => (event) => setValues((prev) => ({ ...prev, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    const clientErrors = validateAddress(values);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) {
      focusFirstError(clientErrors, FIELD_ORDER, idFor);
      return;
    }
    setSaving(true);
    try {
      const { line, city, state, postalCode } = values;
      await onSubmit({ line, city, state, postalCode, ...(makeDefault && { isDefault: true }) });
    } catch (err) {
      setSaving(false);
      showApiError(err, { setErrors, setFormError, fieldOrder: FIELD_ORDER, idFor });
    }
  }

  return (
    <form className="card stack" onSubmit={submit} noValidate aria-labelledby="address-form-heading">
      <h3 id="address-form-heading">{heading}</h3>
      <Alert type="error">{formError}</Alert>
      <FormField id={idFor('line')} label={strings.fields.addressLine} required autoComplete="street-address"
        error={errors.line} value={values.line} onChange={setField('line')} />
      <div className="grid-2">
        <FormField id={idFor('city')} label={strings.fields.city} required autoComplete="address-level2"
          error={errors.city} value={values.city} onChange={setField('city')} />
        <FormField id={idFor('state')} label={strings.fields.state} required autoComplete="address-level1"
          error={errors.state} value={values.state} onChange={setField('state')} />
      </div>
      <FormField id={idFor('postalCode')} label={strings.fields.postalCode} required inputMode="numeric"
        autoComplete="postal-code" hint={strings.register.postalCodeHint} error={errors.postalCode}
        value={values.postalCode} onChange={setField('postalCode')} />
      {showDefaultOption && (
        <div className="checkbox-field">
          <input id="address-default" type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
          <label htmlFor="address-default">{strings.profile.useAsDefault}</label>
        </div>
      )}
      <div className="row">
        <button className="btn" type="submit" disabled={saving}>
          {saving ? strings.forms.saving : strings.profile.saveAddress}
        </button>
        <button className="btn btn-secondary" type="button" onClick={onCancel} disabled={saving}>
          {strings.profile.cancel}
        </button>
      </div>
    </form>
  );
}
