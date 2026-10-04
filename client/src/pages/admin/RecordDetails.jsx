import { useRef } from 'react';
import Modal from '../../components/Modal.jsx';
import strings from '../../resources/strings.js';

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') return <pre className="details-pre">{JSON.stringify(value, null, 2)}</pre>;
  return String(value);
}

// Read-only view of one record (REQ-4 "view").
export default function RecordDetails({ record, onClose }) {
  const closeRef = useRef(null);
  return (
    <Modal title={strings.admin.detailsTitle} onClose={onClose} initialFocusRef={closeRef}>
      <dl className="details-list">
        {Object.entries(record).map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{formatValue(value)}</dd>
          </div>
        ))}
      </dl>
      <div className="dialog-actions">
        <button ref={closeRef} type="button" className="btn" onClick={onClose}>
          {strings.admin.close}
        </button>
      </div>
    </Modal>
  );
}
