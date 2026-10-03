import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import RequireAuth from './auth/RequireAuth.jsx';
import Layout from './components/Layout.jsx';
import strings from './resources/strings.js';
import { ComingSoonPage, HelpPage, NotFoundPage, PrivacyPage } from './pages/InfoPages.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ProfilePage from './pages/profile/ProfilePage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ComingSoonPage name={strings.pages.catalog} />} />
          <Route path="search" element={<ComingSoonPage name={strings.pages.search} />} />
          <Route path="cart" element={<ComingSoonPage name={strings.pages.cart} />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route
            path="profile"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
          <Route path="help" element={<HelpPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
