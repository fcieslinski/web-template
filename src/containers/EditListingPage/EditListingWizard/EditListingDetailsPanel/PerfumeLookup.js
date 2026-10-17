import React, { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';

import { searchPerfumes } from '../../../../util/api';
import { canonicalBrand } from '../../../../util/refumeBrands';
import { matchNotes, translateAccord } from '../../../../util/refumeNotes';

import css from './PerfumeLookup.module.css';

const TITLE_MAX = 60;

// "Eau de Parfum" → words to look for in the concentration options (e.g. "Woda perfumowana (EDP)")
const CONCENTRATION_HINTS = [
  [/extrait|extract/i, ['extrait', 'ekstrakt']],
  [/eau de parfum|\bedp\b/i, ['edp', 'perfumowana']],
  [/eau de toilette|\bedt\b/i, ['edt', 'toaletowa']],
  [/eau de cologne|\bedc\b|cologne/i, ['edc', 'kolońska', 'kolonska']],
  [/parfum|perfume/i, ['parfum', 'perfumy']],
  [/oil|attar/i, ['olejek', 'oil']],
];

const GENDER_HINTS = {
  women: ['damsk', 'kobie'],
  men: ['męsk', 'mesk'],
  unisex: ['uniseks', 'unisex'],
};

const findEnumOption = (fieldConfigs, words) => {
  for (const fc of fieldConfigs) {
    if (fc.schemaType !== 'enum' || fc.scope === 'private') continue;
    const opt = (fc.enumOptions || []).find(o =>
      words.some(w => `${o.label} ${o.option}`.toLowerCase().includes(w))
    );
    if (opt) return { name: `pub_${fc.key}`, value: opt.option };
  }
  return null;
};

const composeTitle = (brand, name, concentration) => {
  const base = name.toLowerCase().includes(brand.toLowerCase()) ? name : `${brand} ${name}`;
  const short = concentration
    .replace(/eau de parfum/i, 'EDP')
    .replace(/eau de toilette/i, 'EDT')
    .replace(/eau de cologne/i, 'EDC');
  const withConc = short && !base.toLowerCase().includes(short.toLowerCase()) ? `${base} ${short}` : base;
  return (withConc.length <= TITLE_MAX ? withConc : base).slice(0, TITLE_MAX).trim();
};

/**
 * Refume: "Znajdź perfumy" — search the Fragella database and fill in the form:
 * title (if empty), brand, concentration, gender (when such fields exist) and the notes.
 */
const PerfumeLookup = props => {
  const { formApi, listingFieldsConfig = [] } = props;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | loading | error | unavailable
  const [chosen, setChosen] = useState(null);
  const [active, setActive] = useState(-1);
  const timer = useRef(null);
  const memo = useRef(new Map()); // same text typed again → no new request

  useEffect(() => {
    clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 4 || (chosen && q === chosen.label)) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(() => {
      if (memo.current.has(q.toLowerCase())) {
        setResults(memo.current.get(q.toLowerCase()));
        return;
      }
      setStatus('loading');
      searchPerfumes(q)
        .then(res => {
          memo.current.set(q.toLowerCase(), res?.data || []);
          setResults(res?.data || []);
          setActive(-1);
          setStatus('idle');
        })
        .catch(e => setStatus(e?.status === 503 ? 'unavailable' : 'error'));
    }, 500);
    return () => clearTimeout(timer.current);
  }, [query]);

  const apply = perfume => {
    const values = formApi.getState().values || {};
    const brand = canonicalBrand(perfume.brand);
    formApi.batch(() => {
      if (!values.title?.trim()) {
        formApi.change('title', composeTitle(brand, perfume.name, perfume.concentration));
      }
      if (listingFieldsConfig.some(fc => fc.key === 'marka')) {
        formApi.change('pub_marka', brand);
      }
      const conc = CONCENTRATION_HINTS.find(([re]) => re.test(perfume.concentration));
      const concMatch = conc
        ? findEnumOption(
            listingFieldsConfig.filter(fc => /stezen|stężen|koncentr/i.test(fc.key)),
            conc[1]
          )
        : null;
      if (concMatch) formApi.change(concMatch.name, concMatch.value);
      const genderWords = GENDER_HINTS[perfume.gender];
      const genderMatch = genderWords ? findEnumOption(listingFieldsConfig, genderWords) : null;
      if (genderMatch) formApi.change(genderMatch.name, genderMatch.value);

      if (perfume.noteIds) {
        // Local catalog / Refume listings: notes are already Refume note ids
        formApi.change('refumeNutyGlowy', perfume.noteIds.top || []);
        formApi.change('refumeNutySerca', perfume.noteIds.middle || []);
        formApi.change('refumeNutyBazy', perfume.noteIds.base || []);
        formApi.change('refumeAkordy', perfume.accordsPl || []);
      } else {
        // Fragella: translate to the Polish dictionary; unknown notes are skipped
        const { top, middle, base, general } = perfume.notes;
        const hasPyramid = top.length || middle.length || base.length;
        formApi.change('refumeNutyGlowy', matchNotes(hasPyramid ? top : general));
        formApi.change('refumeNutySerca', hasPyramid ? matchNotes(middle) : []);
        formApi.change('refumeNutyBazy', hasPyramid ? matchNotes(base) : []);
        formApi.change('refumeAkordy', (perfume.accords || []).map(translateAccord).filter(Boolean));
      }
      formApi.change('refumeFragellaId', perfume.id);
    });
    const label = `${brand} ${perfume.name}`;
    setChosen({ label, perfume });
    setQuery(label);
    setResults([]);
  };

  const onKeyDown = e => {
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(i => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(i => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0) apply(results[active]);
    } else if (e.key === 'Escape') {
      setResults([]);
    }
  };

  if (status === 'unavailable') {
    return null;
  }

  const listId = 'perfume-lookup-list';
  return (
    <div className={css.root}>
      <label htmlFor="perfume-lookup" className={css.label}>
        Znajdź perfumy w bazie
      </label>
      <p className={css.hint}>
        Wpisz nazwę, a uzupełnimy markę, stężenie i nuty zapachowe. Wszystko możesz poprawić.
      </p>
      <div className={css.inputWrapper}>
        <input
          id="perfume-lookup"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          className={css.input}
          placeholder="np. Dior Sauvage"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setChosen(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setResults([]), 150)}
        />
        {status === 'loading' ? <span className={css.spinner} aria-hidden="true" /> : null}
        {results.length ? (
          <ul id={listId} role="listbox" className={css.list}>
            {results.map((p, i) => (
              <li
                key={p.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={classNames(css.option, { [css.optionActive]: i === active })}
                onMouseDown={e => {
                  e.preventDefault();
                  apply(p);
                }}
              >
                {p.image ? <img src={p.image} alt="" className={css.thumb} loading="lazy" /> : null}
                <span className={css.optionText}>
                  <span className={css.optionName}>{p.name}</span>
                  <span className={css.optionMeta}>
                    {[p.brand, p.concentration, p.year].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {status === 'error' ? (
        <p className={css.error}>Nie udało się połączyć z bazą perfum. Uzupełnij pola ręcznie.</p>
      ) : null}
      {chosen ? <p className={css.done}>Uzupełniono dane dla: {chosen.label}</p> : null}
    </div>
  );
};

export default PerfumeLookup;
