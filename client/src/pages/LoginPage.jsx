import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import Alert from '../components/Alert.jsx';
import FormField from '../components/FormField.jsx';
import strings from '../resources/strings.js';
import { focusFirstError } from '../utils/forms.js';
import { compact, email as validateEmail, password as validatePassword } from '../validation/rules.js';

const FIELD_ORDER = ['email', 'password'];
const idFor = (field) => `login-${field}`;

// REQ-2 (FR02): log in with e-mail and password.
export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const setField = (field) => (event) => setValues((prev) => ({ ...prev, [field]: event.target.value }));

  function showErrors(fieldErrors) {
    setErrors(fieldErrors);
    focusFirstError(fieldErrors, FIELD_ORDER, idFor);
  }

  async function onSubmit(event) {
    event.preventDefault();
    setFormError('');
    const clientErrors = compact({ email: validateEmail(values.email), password: validatePassword(values.password) });
    if (Object.keys(clientErrors).length > 0) {
      showErrors(clientErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await login(values.email, values.password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setSubmitting(false);
      const fieldErrors = err.fields || {};
      if (Object.keys(fieldErrors).length > 0) showErrors(fieldErrors);
      setFormError(err.message);
      setValues((prev) => ({ ...prev, password: '' }));
    }
  }

  return (
    <section className="stack narrow">
      <h1>{strings.login.title}</h1>
      <Alert type="error">{formError}</Alert>
      <form className="stack" onSubmit={onSubmit} noValidate>
        <FormField id={idFor('email')} label={strings.fields.email} required type="email" autoComplete="email"
          error={errors.email} value={values.email} onChange={setField('email')} />
        <FormField id={idFor('password')} label={strings.fields.password} required type="password"
          autoComplete="current-password" error={errors.password} value={values.password} onChange={setField('password')} />
        <div>
          <button className="btn" type="submit" disabled={submitting}>
            {submitting ? strings.login.submitting : strings.login.submit}
          </button>
        </div>
      </form>
      <p>
        {strings.login.noAccount} <Link to="/register">{strings.login.register}</Link>
      </p>
    </section>
  );
}
