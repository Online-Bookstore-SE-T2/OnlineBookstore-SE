import { Link } from 'react-router-dom';
import strings from '../resources/strings.js';

// Footer with contact and policy links (SRS 3.1).
export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
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
        <p>{strings.footer.copyright}</p>
      </div>
    </footer>
  );
}
