import ErrorIcon from './ErrorIcon.jsx';

// Form-level message. Errors are announced immediately; status messages politely.
export default function Alert({ type = 'status', children }) {
  if (!children) return null;
  if (type === 'error') {
    return (
      <div className="alert alert-error" role="alert">
        <ErrorIcon />
        <span>{children}</span>
      </div>
    );
  }
  return (
    <div className="alert" role="status">
      {children}
    </div>
  );
}
