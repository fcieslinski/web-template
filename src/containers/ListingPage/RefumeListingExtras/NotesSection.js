import React from 'react';

import { noteLabel } from '../../../util/refumeNotes';
import css from './RefumeListingExtras.module.css';

const TIERS = [
  ['glowy', 'Głowa', 'Czujesz od razu po psiknięciu'],
  ['serca', 'Serce', 'Rozwija się po kilkunastu minutach'],
  ['bazy', 'Baza', 'Zostaje na skórze najdłużej'],
];

// Accord → colour (hue, saturation). Light tints with dark text, so every bar stays readable.
const ACCORD_COLORS = [
  [/cytrus/, 50, 90],
  [/kwaśn/, 65, 80],
  [/zielon|iglast|konopn/, 110, 45],
  [/ziołow|aromatyczn|lawend|kamfor|anyż/, 140, 30],
  [/morsk|wodn|ozonow|mineraln|słon|metaliczn/, 200, 70],
  [/świeży/, 185, 55],
  [/różan/, 345, 75],
  [/fioł|irys|pudrow/, 275, 45],
  [/kwiat|tuberoz/, 330, 60],
  [/owoc|wiśni|tropik|kokos/, 15, 85],
  [/słodk|karmel|miod|gourmand|migdał|orzech|mleczn/, 30, 75],
  [/wanili/, 40, 65],
  [/czekolad|kakao|kaw/, 20, 35],
  [/przyprawow|cynamon/, 12, 65],
  [/drzewn|paczul|mszyst|ziemist|oud/, 28, 35],
  [/skórz|tyton|dymn|rum|whisky/, 18, 25],
  [/ambr|balsam/, 35, 60],
  [/piżm|zwierz|mydlan|aldehyd|wosk/, 230, 20],
];

const accordColor = label => {
  const l = String(label).toLowerCase();
  const found = ACCORD_COLORS.find(([re]) => re.test(l));
  const [, hue, sat] = found || [null, 0, 0];
  return `hsl(${hue} ${sat}% 82%)`;
};

/**
 * Refume: "Nuty zapachowe" — main accords as bars (left) and the perfume pyramid with
 * top / heart / base notes (right). Stacked on small screens.
 */
const NotesSection = ({ publicData }) => {
  const nuty = publicData?.nuty || {};
  const accords = Array.isArray(publicData?.akordy) ? publicData.akordy.slice(0, 8) : [];
  const tiers = TIERS.filter(([key]) => Array.isArray(nuty[key]) && nuty[key].length);
  if (!tiers.length && !accords.length) {
    return null;
  }
  const twoColumns = tiers.length > 0 && accords.length > 0;

  return (
    <section className={css.notes} aria-labelledby="notes-title">
      <h2 id="notes-title" className={css.notesTitle}>
        Nuty zapachowe
      </h2>
      <div className={twoColumns ? css.notesGrid : undefined}>
        {accords.length ? (
          <div className={css.accordsBlock}>
            <h3 className={css.notesSubtitle}>Główne akordy</h3>
            <ul className={css.accordBars}>
              {accords.map((a, i) => (
                <li
                  key={a}
                  className={css.accordBar}
                  style={{
                    width: `${Math.max(45, 100 - i * 9)}%`,
                    backgroundColor: accordColor(a),
                  }}
                >
                  {a}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {tiers.length ? (
          <div className={css.pyramidBlock}>
            <h3 className={css.notesSubtitle}>Piramida zapachowa</h3>
            <ol className={css.pyramid}>
              {tiers.map(([key, label, hint]) => (
                <li key={key} className={`${css.tier} ${css[`tier_${key}`]}`}>
                  <div className={css.tierHead}>
                    <span className={css.tierLabel}>{label}</span>
                    <span className={css.tierHint}>{hint}</span>
                  </div>
                  <ul className={css.tierNotes}>
                    {nuty[key].map(n => (
                      <li key={n} className={css.note}>
                        {noteLabel(n) || n}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default NotesSection;
