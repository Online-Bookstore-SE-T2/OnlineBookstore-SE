import { Link } from 'react-router-dom';
import strings from '../resources/strings.js';

// Placeholder for screens owned by other feature slices (catalog, search, cart).
export function ComingSoonPage({ name }) {
  return (
    <section className="stack">
      <h1>{strings.pages.comingSoonTitle(name)}</h1>
      <p className="muted">{strings.pages.comingSoonBody}</p>
    </section>
  );
}

export function NotFoundPage() {
  return (
    <section className="stack">
      <h1>{strings.pages.notFoundTitle}</h1>
      <p>{strings.pages.notFoundBody}</p>
      <p>
        <Link to="/">{strings.pages.backHome}</Link>
      </p>
    </section>
  );
}

export function HelpPage() {
  return (
    <section className="stack narrow">
      <h1>{strings.help.title}</h1>
      <p className="muted">{strings.help.intro}</p>
      {strings.help.sections.map((section) => (
        <div key={section.heading}>
          <h2>{section.heading}</h2>
          <p>{section.body}</p>
        </div>
      ))}
      <div id="contact">
        <h2>{strings.help.contactHeading}</h2>
        <p>{strings.help.contactBody}</p>
      </div>
    </section>
  );
}

// Privacy notice required by SRS 7 (legal).
export function PrivacyPage() {
  return (
    <section className="stack narrow">
      <h1>{strings.privacy.title}</h1>
      <p className="muted">{strings.privacy.intro}</p>
      {strings.privacy.sections.map((section) => (
        <div key={section.heading}>
          <h2>{section.heading}</h2>
          <p>{section.body}</p>
        </div>
      ))}
    </section>
  );
}
