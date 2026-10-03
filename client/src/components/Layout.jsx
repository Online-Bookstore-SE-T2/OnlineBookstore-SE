import { Outlet } from 'react-router-dom';
import strings from '../resources/strings.js';
import Header from './Header.jsx';
import Footer from './Footer.jsx';

export default function Layout() {
  return (
    <div className="app">
      <a href="#main" className="skip-link">
        {strings.skipToContent}
      </a>
      <Header />
      <main id="main" className="main" tabIndex={-1}>
        <div className="container">
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  );
}
