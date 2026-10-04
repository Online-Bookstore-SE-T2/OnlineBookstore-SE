import { useRef } from 'react';
import strings from '../resources/strings.js';
import Modal from './Modal.jsx';

// Confirmation dialog for destructive actions (SRS 3.1). Focus starts on Cancel so that
// pressing Enter by accident never confirms. Optional children (e.g. a reason field) sit
// above the buttons.
export default function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel, busy = false, children }) {
  const cancelRef = useRef(null);
  return (
    <Modal title={title} description={message} role="alertdialog" onClose={onCancel} initialFocusRef={cancelRef}>
      {children}
      <div className="dialog-actions">
        <button ref={cancelRef} type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
          {strings.dialog.cancel}
        </button>
        <button type="button" className="btn" onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
