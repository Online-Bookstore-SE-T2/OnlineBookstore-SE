import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import strings from './resources/strings.js';
import { ComingSoonPage, HelpPage, NotFoundPage, PrivacyPage } from './pages/InfoPages.jsx';
import RegisterPage from './pages/RegisterPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ComingSoonPage name={strings.pages.catalog} />} />
        <Route path="search" element={<ComingSoonPage name={strings.pages.search} />} />
        <Route path="cart" element={<ComingSoonPage name={strings.pages.cart} />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
