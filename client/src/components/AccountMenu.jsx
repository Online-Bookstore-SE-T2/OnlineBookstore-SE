import { Link } from 'react-router-dom';
import strings from '../resources/strings.js';

// Visitors see Log in and Register.
export default function AccountMenu() {
  return (
    <>
      <Link to="/login">{strings.header.login}</Link>
      <Link to="/register">{strings.header.register}</Link>
    </>
  );
}
