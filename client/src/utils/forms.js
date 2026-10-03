import strings from '../resources/strings.js';

// Moves focus to the first field that has an error, following the order the fields appear in.
export function focusFirstError(errors, fieldOrder, idFor) {
  const first = fieldOrder.find((field) => errors[field]);
  if (first) document.getElementById(idFor(first))?.focus();
}

// Shows an API failure on a form: per-field errors inline (focusing the first one),
// anything else as a form-level message.
export function showApiError(err, { setErrors, setFormError, fieldOrder, idFor }) {
  const fieldErrors = err.fields || {};
  if (Object.keys(fieldErrors).length > 0) {
    setErrors(fieldErrors);
    focusFirstError(fieldErrors, fieldOrder, idFor);
    setFormError(strings.errors.fixFields);
  } else {
    setFormError(err.message);
  }
}
