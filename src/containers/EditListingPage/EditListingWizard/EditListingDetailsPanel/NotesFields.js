import React, { useState } from 'react';
import { Field } from 'react-final-form';
import classNames from 'classnames';

import { noteLabel, suggestNotes } from '../../../../util/refumeNotes';

import css from './NotesFields.module.css';

const TIERS = [
  ['refumeNutyGlowy', 'Nuty głowy'],
  ['refumeNutySerca', 'Nuty serca'],
  ['refumeNutyBazy', 'Nuty bazy'],
];

const MAX_PER_TIER = 20;

/** One tier: selected notes as removable chips + an input that suggests notes from the dictionary. */
const NotesTier = ({ input, id, label }) => {
  const selected = Array.isArray(input.value) ? input.value : [];
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);

  const suggestions = open ? suggestNotes(query, selected) : [];
  const listId = `${id}-list`;

  const add = noteId => {
    if (selected.length >= MAX_PER_TIER) return;
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
      <div className={css.box}>
        {selected.map(noteId => (
          <span key={noteId} className={css.chip}>
            {noteLabel(noteId) || noteId}
            <button
              type="button"
              className={css.remove}
              aria-label={`Usuń: ${noteLabel(noteId) || noteId}`}
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
            placeholder={selected.length ? 'Dodaj nutę…' : 'Zacznij pisać, np. wanilia'}
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
            <p className={css.noMatch}>Nie ma takiej nuty w bazie.</p>
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
