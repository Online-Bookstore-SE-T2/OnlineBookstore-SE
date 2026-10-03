import { useEffect } from 'react';
import { apiRequest } from '../../api/http.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import strings from '../../resources/strings.js';
import { formatDate } from '../../utils/format.js';
import AddressBook from './AddressBook.jsx';
import PasswordForm from './PasswordForm.jsx';
import ProfileDetailsForm from './ProfileDetailsForm.jsx';

// REQ-3 (FR03): profile details, password and delivery addresses of the logged-in user.
export default function ProfilePage() {
  const { user, setUser } = useAuth();

  // Refresh from the server so the page always shows the stored values.
  useEffect(() => {
    apiRequest('/users/me')
      .then((data) => setUser(data.user))
      .catch(() => {});
  }, [setUser]);

  const readOnly = user.status === 'Suspended';
  const setAddresses = (addresses) => setUser((prev) => ({ ...prev, addresses }));

  return (
    <section className="stack">
      <h1>{strings.profile.title}</h1>
      <p className="muted">
        {strings.profile.role(user.role)} · {strings.profile.memberSince(formatDate(user.registrationDate))}
      </p>
      <div className="grid-2">
        <ProfileDetailsForm key={user.id} user={user} readOnly={readOnly} onSaved={setUser} />
        <PasswordForm readOnly={readOnly} />
      </div>
      <AddressBook addresses={user.addresses || []} readOnly={readOnly} onChange={setAddresses} />
    </section>
  );
}
