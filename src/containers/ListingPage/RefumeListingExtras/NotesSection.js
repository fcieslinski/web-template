import React from 'react';

import css from './RefumeListingExtras.module.css';

const ROWS = [
  ['glowy', 'Nuty głowy', 'Czujesz od razu po psiknięciu'],
  ['serca', 'Nuty serca', 'Rozwijają się po kilkunastu minutach'],
  ['bazy', 'Nuty bazy', 'Zostają na skórze najdłużej'],
];

/** Refume: perfume pyramid (top / heart / base notes) and main accords on the listing page. */
const NotesSection = ({ publicData }) => {
  const nuty = publicData?.nuty || {};
  const accords = Array.isArray(publicData?.akordy) ? publicData.akordy : [];
  const rows = ROWS.filter(([key]) => Array.isArray(nuty[key]) && nuty[key].length);
  if (!rows.length && !accords.length) {
    return null;
  }
  return (
    <section className={css.notes} aria-labelledby="notes-title">
      <h2 id="notes-title" className={css.notesTitle}>
        Nuty zapachowe
      </h2>
      {accords.length ? (
        <p className={css.accords}>
          <span className={css.accordsLabel}>Główne akordy:</span> {accords.join(', ')}
        </p>
      ) : null}
      <dl className={css.pyramid}>
        {rows.map(([key, label, hint]) => (
          <div key={key} className={css.pyramidRow}>
            <dt className={css.pyramidLabel}>
              {label}
              <span className={css.pyramidHint}>{hint}</span>
            </dt>
            <dd className={css.pyramidNotes}>
              {nuty[key].map(n => (
                <span key={n} className={css.note}>
                  {n}
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

export default NotesSection;
