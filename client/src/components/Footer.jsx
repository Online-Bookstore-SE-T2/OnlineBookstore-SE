import { Link } from 'react-router-dom';
import strings from '../resources/strings.js';
import { BookIcon } from './Icons.jsx';

// Footer with contact and policy links (SRS 3.1).
export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-about">
          <p className="footer-brand">
            <span className="logo-mark">
              <BookIcon size={18} />
            </span>
            {strings.appName}
          </p>
          <p>{strings.footer.about}</p>
        </div>

        <nav aria-labelledby="footer-shop">
          <h2 id="footer-shop" className="footer-heading">{strings.footer.shopHeading}</h2>
          <ul className="footer-links">
            <li>
              <Link to="/">{strings.footer.allBooks}</Link>
            </li>
            <li>
              <Link to="/search">{strings.footer.search}</Link>
            </li>
            <li>
              <Link to="/profile">{strings.footer.becomeSeller}</Link>
            </li>
          </ul>
        </nav>

        <nav aria-labelledby="footer-support">
          <h2 id="footer-support" className="footer-heading">{strings.footer.supportHeading}</h2>
          <ul className="footer-links">
            <li>
              <Link to="/help#contact">{strings.footer.contact}</Link>
            </li>
            <li>
              <Link to="/privacy">{strings.footer.privacy}</Link>
            </li>
            <li>
              <Link to="/help">{strings.footer.help}</Link>
            </li>
          </ul>
        </nav>
      </div>

      <div className="container">
        <p className="footer-copyright">{strings.footer.copyright}</p>
      </div>
    </footer>
  );
}
