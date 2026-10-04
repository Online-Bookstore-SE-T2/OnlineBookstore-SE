import { useRef, useState } from 'react';
import strings from '../../resources/strings.js';
import EntityPanel from './EntityPanel.jsx';
import { ADMIN_SECTIONS } from './entityConfigs.jsx';

// REQ-4 (FR15): administration console with one tab per kind of record.
// Tabs follow the WAI-ARIA tabs pattern: arrow keys, Home and End move between them (NFR11).
export default function AdminConsolePage() {
  const [activeId, setActiveId] = useState(ADMIN_SECTIONS[0].id);
  const tabRefs = useRef({});
  const active = ADMIN_SECTIONS.find((section) => section.id === activeId);

  function select(index) {
    const section = ADMIN_SECTIONS[(index + ADMIN_SECTIONS.length) % ADMIN_SECTIONS.length];
    setActiveId(section.id);
    tabRefs.current[section.id]?.focus();
  }

  function onKeyDown(event) {
    const index = ADMIN_SECTIONS.findIndex((section) => section.id === activeId);
    const moves = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: ADMIN_SECTIONS.length - 1 };
    if (event.key in moves) {
      event.preventDefault();
      select(moves[event.key]);
    }
  }

  return (
    <section className="stack">
      <h1>{strings.admin.title}</h1>
      <div className="tabs" role="tablist" aria-label={strings.admin.tabsLabel} onKeyDown={onKeyDown}>
        {ADMIN_SECTIONS.map((section) => (
          <button
            key={section.id}
            ref={(element) => {
              tabRefs.current[section.id] = element;
            }}
            id={`tab-${section.id}`}
            type="button"
            role="tab"
            aria-selected={section.id === activeId}
            aria-controls={`panel-${section.id}`}
            tabIndex={section.id === activeId ? 0 : -1}
            onClick={() => setActiveId(section.id)}
          >
            {section.title}
          </button>
        ))}
      </div>
      <div id={`panel-${active.id}`} role="tabpanel" aria-labelledby={`tab-${active.id}`}>
        <EntityPanel key={active.id} config={active} />
      </div>
    </section>
  );
}
