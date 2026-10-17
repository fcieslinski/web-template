import React, { useState } from 'react';
import { Field } from 'react-final-form';
import classNames from 'classnames';

import { noteLabel, suggestNotes, suggestAccords } from '../../../../util/refumeNotes';

import css from './NotesFields.module.css';

const TIERS = [
  ['refumeNutyGlowy', 'Nuty głowy'],
  ['refumeNutySerca', 'Nuty serca'],
  ['refumeNutyBazy', 'Nuty bazy'],
];

const MAX_PER_TIER = 20;
const MAX_ACCORDS = 6;

const accordLabel = label => label;

/**
 * Chips + input with suggestions from a fixed list (no custom values).
 * Used for notes (ids from the notes dictionary) and main accords (Polish labels).
 */
const NotesTier = ({
  input,
  id,
  label,
  hint,
  max = MAX_PER_TIER,
  suggest = suggestNotes,
  getLabel = noteLabel,
  placeholder = 'Zacznij pisać, np. wanilia',
  noMatchText = 'Nie ma takiej nuty w bazie.',
}) => {
  const selected = Array.isArray(input.value) ? input.value : [];
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);

  const full = selected.length >= max;
  const suggestions = open && !full ? suggest(query, selected) : [];
  const listId = `${id}-list`;

  const add = noteId => {
    if (selected.length >= max) return;
    input.onChange([...selected, noteId]);
    setQuery('');
    setActive(-1);
  };
  const remove = noteId => input.onChange(selected.filter(n => n !== noteId));

  const onKeyDown = e => {
    if (e.key === 'Backspace' && !query && selected.length) {
      remove(selected[selected.length - 1]);
      return;
    }
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(i => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(i => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      add(suggestions[active >= 0 ? active : 0].id);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className={css.tier}>
      <label htmlFor={id} className={css.tierLabel}>
        {label}
      </label>
      {hint ? <p className={css.tierHint}>{hint}</p> : null}
      <div className={css.box}>
        {selected.map(noteId => (
          <span key={noteId} className={css.chip}>
            {getLabel(noteId) || noteId}
            <button
              type="button"
              className={css.remove}
              aria-label={`Usuń: ${getLabel(noteId) || noteId}`}
              onClick={() => remove(noteId)}
            >
              ×
            </button>
          </span>
        ))}
        <div className={css.inputWrapper}>
          <input
            id={id}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestions.length > 0}
            aria-controls={listId}
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            autoComplete="off"
            className={css.input}
            placeholder={full ? 'Limit osiągnięty' : selected.length ? 'Dodaj kolejną…' : placeholder}
            disabled={full}
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKeyDown}
          />
          {suggestions.length ? (
            <ul id={listId} role="listbox" className={css.list}>
              {suggestions.map((n, i) => (
                <li
                  key={n.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={classNames(css.option, { [css.optionActive]: i === active })}
                  onMouseDown={e => {
                    e.preventDefault();
                    add(n.id);
                  }}
                >
                  {n.pl}
                </li>
              ))}
            </ul>
          ) : null}
          {open && query.trim().length >= 2 && !suggestions.length ? (
            <p className={css.noMatch}>{noMatchText}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
};

/** Refume: perfume notes (top / heart / base), picked from the notes dictionary. */
const NotesFields = ({ formId }) => (
  <fieldset className={css.root}>
    <legend className={css.legend}>Nuty zapachowe (opcjonalnie)</legend>
    <p className={css.hint}>
      Uzupełniają się same po wybraniu perfum z bazy. Możesz je usunąć (×) albo dodać kolejne.
    </p>
    <Field
      name="refumeAkordy"
      id={`${formId}refumeAkordy`}
      label="Główne akordy"
      hint="Najprostszy opis zapachu, np. drzewny, słodki, świeży. Wystarczą 2–3."
      component={NotesTier}
      max={MAX_ACCORDS}
      suggest={suggestAccords}
      getLabel={accordLabel}
      placeholder="Zacznij pisać, np. drzewny"
      noMatchText="Nie ma takiego akordu w bazie."
      isEqual={(a, b) => JSON.stringify(a || []) === JSON.stringify(b || [])}
    />
    <p className={css.pyramidIntro}>Piramida nut (opcjonalnie, dla znawców)</p>
    {TIERS.map(([name, label]) => (
      <Field
        key={name}
        name={name}
        id={`${formId}${name}`}
        label={label}
        component={NotesTier}
        isEqual={(a, b) => JSON.stringify(a || []) === JSON.stringify(b || [])}
      />
    ))}
  </fieldset>
);

export default NotesFields;
