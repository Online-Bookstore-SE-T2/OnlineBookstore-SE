import { useState } from 'react';
import { apiRequest } from '../../api/http.js';
import FormField from '../../components/FormField.jsx';
import strings from '../../resources/strings.js';
import { LIMITS, requiredText } from '../../validation/rules.js';

// BR-3: administrators add categories to the catalog structure.
export default function CategoryCreateForm({ onDone }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    const clientError = requiredText(name, strings.admin.categoryNameLabel, LIMITS.categoryName);
    setError(clientError || '');
    if (clientError) return;
    setSaving(true);
    try {
      await apiRequest('/admin/categories', { method: 'POST', body: { name } });
      setName('');
      onDone();
    } catch (err) {
      setError(err.fields?.name || err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="row align-end" onSubmit={onSubmit} noValidate>
      <FormField id="new-category" label={strings.admin.newCategory} required error={error} value={name}
        onChange={(event) => setName(event.target.value)} />
      <button type="submit" className="btn" disabled={saving}>
        {strings.admin.addCategory}
      </button>
    </form>
  );
}
