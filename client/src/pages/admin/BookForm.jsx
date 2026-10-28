import { useEffect, useState } from 'react';
import { apiRequest } from '../../api/http.js';
import Alert from '../../components/Alert.jsx';
import FormField from '../../components/FormField.jsx';
import Modal from '../../components/Modal.jsx';
import strings from '../../resources/strings.js';
import { focusFirstError, showApiError } from '../../utils/forms.js';
import { validateBook } from '../../validation/rules.js';

const FIELD_ORDER = ['isbn', 'title', 'author', 'category', 'price', 'description', 'coverImageUrl'];
const idFor = (field) => `book-${field}`;
const f = strings.fields;
const t = strings.admin;

function initialValues(book) {
  return {
    isbn: book?.isbn || '',
    title: book?.title || '',
    author: book?.author || '',
    category: book?.category?.id || '',
    price: typeof book?.price === 'number' ? String(book.price) : '',
    description: book?.description || '',
    coverImageUrl: book?.coverImageUrl || '',
  };
}

// Adds a catalog book (REQ-4) or, given `book`, edits its details. Listings can only reference
// catalog books (BR-4), so this is how new titles enter the store. The ISBN identifies a book
// and is shown but not editable.
export default function BookForm({ book, onSaved, onCancel }) {
  const creating = !book;
  const [values, setValues] = useState(() => initialValues(book));
  const [categories, setCategories] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiRequest('/books/categories')
      .then((result) => {
        if (!cancelled) setCategories(result.items);
      })
      .catch(() => {
        if (cancelled) return;
        setCategories([]);
        setFormError(t.categoriesUnavailable);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setField = (field) => (event) => setValues((prev) => ({ ...prev, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    const clientErrors = validateBook(values, { creating });
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) {
      focusFirstError(clientErrors, FIELD_ORDER, idFor);
      return;
    }
    setSaving(true);
    const { isbn, ...details } = values;
    const body = { ...details, price: Number(values.price) };
    try {
      if (creating) await apiRequest('/admin/books', { method: 'POST', body: { isbn, ...body } });
      else await apiRequest(`/admin/books/${book.id}`, { method: 'PATCH', body });
      onSaved();
    } catch (err) {
      setSaving(false);
      showApiError(err, { setErrors, setFormError, fieldOrder: FIELD_ORDER, idFor });
    }
  }

  return (
    <Modal title={creating ? t.addBookTitle : t.editBookTitle} onClose={onCancel}>
      <form className="stack" onSubmit={submit} noValidate>
        <Alert type="error">{formError}</Alert>
        {creating ? (
          <FormField id={idFor('isbn')} label={f.isbn} required inputMode="numeric" hint={t.isbnHint}
            error={errors.isbn} value={values.isbn} onChange={setField('isbn')} />
        ) : (
          <p>
            <strong>{f.isbn}:</strong> {book.isbn}
          </p>
        )}
        <FormField id={idFor('title')} label={f.title} required error={errors.title} value={values.title} onChange={setField('title')} />
        <FormField id={idFor('author')} label={f.author} required error={errors.author} value={values.author} onChange={setField('author')} />
        <div className="grid-2">
          <FormField id={idFor('category')} as="select" label={f.category} required disabled={!categories}
            error={errors.category} value={values.category} onChange={setField('category')}>
            <option value="">{categories ? t.chooseCategory : t.loading}</option>
            {(categories || []).map((category) => (
              <option key={category._id} value={category._id}>{category.name}</option>
            ))}
          </FormField>
          <FormField id={idFor('price')} label={f.price} required inputMode="decimal"
            error={errors.price} value={values.price} onChange={setField('price')} />
        </div>
        <FormField id={idFor('description')} as="textarea" label={f.description}
          error={errors.description} value={values.description} onChange={setField('description')} />
        <FormField id={idFor('coverImageUrl')} label={f.coverImageUrl} type="url" hint={t.coverHint}
          error={errors.coverImageUrl} value={values.coverImageUrl} onChange={setField('coverImageUrl')} />
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
            {strings.dialog.cancel}
          </button>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? strings.forms.saving : t.saveBook}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Books tab toolbar: opens the form for a new book.
export function AddBookButton({ onDone }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="row">
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        {t.addBook}
      </button>
      {open && (
        <BookForm
          onCancel={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            onDone();
          }}
        />
      )}
    </div>
  );
}
