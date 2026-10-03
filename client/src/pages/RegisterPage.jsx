import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api/http.js';
import Alert from '../components/Alert.jsx';
import FormField from '../components/FormField.jsx';
import strings from '../resources/strings.js';
import { focusFirstError } from '../utils/forms.js';
import { validateRegistration } from '../validation/rules.js';

const FIELD_ORDER = ['name', 'email', 'password', 'phone', 'address.line', 'address.city', 'address.state', 'address.postalCode'];
const idFor = (field) => `register-${field.replace('.', '-')}`;

const EMPTY = { name: '', email: '', password: '', phone: '', address: { line: '', city: '', state: '', postalCode: '' } };

// REQ-1 (FR01): registration with name, e-mail and password; phone and one address optional.
export default function RegisterPage() {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(false);

  const setField = (field) => (event) => setValues((prev) => ({ ...prev, [field]: event.target.value }));
  const setAddressField = (field) => (event) =>
    setValues((prev) => ({ ...prev, address: { ...prev.address, [field]: event.target.value } }));

  function showErrors(fieldErrors) {
    setErrors(fieldErrors);
    focusFirstError(fieldErrors, FIELD_ORDER, idFor);
  }

  async function onSubmit(event) {
    event.preventDefault();
    setFormError('');
    const clientErrors = validateRegistration(values);
    if (Object.keys(clientErrors).length > 0) {
      showErrors(clientErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const hasAddress = Object.values(values.address).some((part) => part.trim() !== '');
      await apiRequest('/auth/register', {
        method: 'POST',
        body: {
          name: values.name,
          email: values.email,
          password: values.password,
          ...(values.phone.trim() && { phone: values.phone.trim() }),
          ...(hasAddress && { address: values.address }),
        },
      });
      setCreated(true);
    } catch (err) {
      const fieldErrors = err.fields || {};
      const hasFieldErrors = Object.keys(fieldErrors).length > 0;
      if (hasFieldErrors) showErrors(fieldErrors);
      setFormError(hasFieldErrors ? strings.errors.fixFields : err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <section className="stack narrow">
        <h1>{strings.register.successTitle}</h1>
        <Alert>{strings.register.success}</Alert>
        <p>
          <Link className="btn" to="/login">
            {strings.register.goToLogin}
          </Link>
        </p>
      </section>
    );
  }

  const fieldProps = (field) => ({ id: idFor(field), error: errors[field] });

  return (
    <section className="stack narrow">
      <h1>{strings.register.title}</h1>
      <p className="muted">{strings.register.intro}</p>
      <Alert type="error">{formError}</Alert>
      <form className="stack" onSubmit={onSubmit} noValidate>
        <FormField {...fieldProps('name')} label={strings.fields.name} required autoComplete="name"
          value={values.name} onChange={setField('name')} />
        <FormField {...fieldProps('email')} label={strings.fields.email} required type="email" autoComplete="email"
          value={values.email} onChange={setField('email')} />
        <FormField {...fieldProps('password')} label={strings.fields.password} required type="password"
          autoComplete="new-password" value={values.password} onChange={setField('password')} />
        <FormField {...fieldProps('phone')} label={strings.fields.phone} type="tel" inputMode="numeric"
          autoComplete="tel-national" hint={strings.register.phoneHint} value={values.phone} onChange={setField('phone')} />
        <fieldset className="stack">
          <legend>{strings.register.addressLegend}</legend>
          <p className="hint muted">{strings.register.addressHint}</p>
          <FormField {...fieldProps('address.line')} label={strings.fields.addressLine} autoComplete="street-address"
            value={values.address.line} onChange={setAddressField('line')} />
          <div className="grid-2">
            <FormField {...fieldProps('address.city')} label={strings.fields.city} autoComplete="address-level2"
              value={values.address.city} onChange={setAddressField('city')} />
            <FormField {...fieldProps('address.state')} label={strings.fields.state} autoComplete="address-level1"
              value={values.address.state} onChange={setAddressField('state')} />
          </div>
          <FormField {...fieldProps('address.postalCode')} label={strings.fields.postalCode} inputMode="numeric"
            autoComplete="postal-code" hint={strings.register.postalCodeHint}
            value={values.address.postalCode} onChange={setAddressField('postalCode')} />
        </fieldset>
        <div>
          <button className="btn" type="submit" disabled={submitting}>
            {submitting ? strings.register.submitting : strings.register.submit}
          </button>
        </div>
      </form>
      <p>
        {strings.register.haveAccount} <Link to="/login">{strings.register.login}</Link>
      </p>
    </section>
  );
}
