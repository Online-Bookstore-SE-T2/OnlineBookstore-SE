import { Link } from 'react-router-dom';
import { Burst } from '../components/Icons.jsx';
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
    <section className="not-found">
      <div className="not-found-sticker" aria-hidden="true">
        <Burst size={200} />
        <span>404</span>
      </div>
      <div className="stack">
        <h1>{strings.pages.notFoundTitle}</h1>
        <p>{strings.pages.notFoundBody}</p>
        <p>
          <Link className="btn" to="/">{strings.pages.backHome}</Link>
        </p>
      </div>
    </section>
  );
}

export function HelpPage() {
  return (
    <section className="stack info-page">
      <div className="page-head">
        <h1>{strings.help.title}</h1>
        <p className="muted">{strings.help.intro}</p>
      </div>
      <div className="info-grid">
        {strings.help.sections.map((section) => (
          <div className="card" key={section.heading}>
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
          </div>
        ))}
        <div className="card info-contact" id="contact">
          <h2>{strings.help.contactHeading}</h2>
          <p>{strings.help.contactBody}</p>
        </div>
      </div>
    </section>
  );
}

// Privacy notice required by SRS 7 (legal).
export function PrivacyPage() {
  return (
    <section className="stack narrow info-page">
      <div className="page-head">
        <h1>{strings.privacy.title}</h1>
        <p className="muted">{strings.privacy.intro}</p>
      </div>
      {strings.privacy.sections.map((section) => (
        <div className="card" key={section.heading}>
          <h2>{section.heading}</h2>
          <p>{section.body}</p>
        </div>
      ))}
    </section>
  );
}
