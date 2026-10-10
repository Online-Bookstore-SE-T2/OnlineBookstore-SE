import { Route, Routes } from 'react-router-dom';
import CatalogPage from './pages/CatalogPage.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import RequireAuth from './auth/RequireAuth.jsx';
import Layout from './components/Layout.jsx';
import { HelpPage, NotFoundPage, PrivacyPage } from './pages/InfoPages.jsx';
import { SearchPage } from './pages/SearchPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ProfilePage from './pages/profile/ProfilePage.jsx';
import AdminConsolePage from './pages/admin/AdminConsolePage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import BookDetailsPage from './pages/BookDetailsPage.jsx';
import CartPage from './pages/CartPage.jsx';
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<CatalogPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="cart" element={<RequireAuth><CartPage /></RequireAuth>} />
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
          <Route
            path="admin"
            element={
              <RequireAuth roles={['Administrator']}>
                <AdminConsolePage />
              </RequireAuth>
            }
          />
          <Route path="help" element={<HelpPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="*" element={<NotFoundPage />} />
          <Route path="books/:bookId" element={<BookDetailsPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
