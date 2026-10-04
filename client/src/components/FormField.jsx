import strings from '../resources/strings.js';
import ErrorIcon from './ErrorIcon.jsx';

// Labelled input with an inline error beneath it (SRS 3.1): red text, an icon and a message,
// linked to the input through aria-describedby so screen readers announce it (NFR11).
export default function FormField({ id, label, error, hint, required = false, as: Control = 'input', children, ...controlProps }) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="form-field">
      <label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true"> *</span>
        ) : (
          <span className="muted"> {strings.forms.optional}</span>
        )}
      </label>
      {hint && (
        <span id={hintId} className="hint">
          {hint}
        </span>
      )}
      <Control
        id={id}
        name={id}
        aria-required={required || undefined}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        {...controlProps}
      >
        {children}
      </Control>
      {error && (
        <p id={errorId} className="field-error">
          <ErrorIcon />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
