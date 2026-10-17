import React, { useState } from 'react';
import { Field } from 'react-final-form';
import classNames from 'classnames';

import { required } from '../../util/validators';
import {
  suggestBrands,
  canonicalBrand,
  isKnownBrand,
  didYouMeanBrand,
} from '../../util/refumeBrands';

import css from './BrandField.module.css';

/**
 * Refume: brand input with suggestions from the brand list (combobox pattern).
 * - typing "Di" suggests "Dior", "Diesel"…
 * - on blur, "dior" becomes "Dior", "ysl" becomes "Yves Saint Laurent"
 * - a likely typo ("Doir") shows "Czy chodziło o: Dior?"
 * Brands not on the list are still accepted.
 */
const BrandInput = props => {
  const { input, meta, id, label, placeholder, helpText } = props;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const value = input.value || '';
  const suggestions = open ? suggestBrands(value) : [];
  const exact = suggestions.length === 1 && suggestions[0] === value;
  const showList = suggestions.length > 0 && !exact;
  const typoSuggestion = !open && value && !isKnownBrand(value) ? didYouMeanBrand(value) : null;
  const listId = `${id}-listbox`;
  const hasError = meta.touched && meta.error;

  const choose = brand => {
    input.onChange(brand);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = e => {
    if (!showList) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(i => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(i => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className={css.root}>
      <label htmlFor={id} className={css.label}>
        {label}
      </label>
      <div className={css.inputWrapper}>
        <input
          {...input}
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={!!hasError}
          autoComplete="off"
          placeholder={placeholder}
          className={classNames(css.input, { [css.inputError]: hasError })}
          onChange={e => {
            input.onChange(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={e => {
            input.onFocus(e);
            setOpen(true);
          }}
          onBlur={e => {
            // Let a click on a suggestion land first
            setTimeout(() => {
              setOpen(false);
              const canonical = canonicalBrand(input.value);
              if (canonical !== input.value) input.onChange(canonical);
            }, 120);
            input.onBlur(e);
          }}
          onKeyDown={onKeyDown}
        />
        {showList ? (
          <ul id={listId} role="listbox" className={css.list}>
            {suggestions.map((brand, i) => (
              <li
                key={brand}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={classNames(css.option, { [css.optionActive]: i === active })}
                onMouseDown={e => {
                  e.preventDefault();
                  choose(brand);
                }}
              >
                {brand}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {typoSuggestion ? (
        <p className={css.typo}>
          Czy chodziło o{' '}
          <button type="button" className={css.typoButton} onClick={() => choose(typoSuggestion)}>
            {typoSuggestion}
          </button>
          ?
        </p>
      ) : null}
      {hasError ? <p className={css.error}>{meta.error}</p> : null}
      {helpText && !hasError ? <p className={css.help}>{helpText}</p> : null}
    </div>
  );
};

const BrandField = props => {
  const { name, fieldConfig, defaultRequiredMessage, formId, label, placeholder } = props;
  const { isRequired, requiredMessage } = fieldConfig?.saveConfig || {};
  const validate = isRequired ? required(requiredMessage || defaultRequiredMessage) : undefined;
  return (
    <Field
      name={name}
      validate={validate}
      component={BrandInput}
      id={formId ? `${formId}.${name}` : name}
      label={label}
      placeholder={placeholder || 'Zacznij pisać, np. Dior'}
      helpText={fieldConfig?.helpText}
    />
  );
};

export default BrandField;
