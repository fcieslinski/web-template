import React from 'react';

import { FieldTextInput } from '../../../../components';

import css from './PerfumeLookup.module.css';

/** Refume: perfume notes, comma separated (filled by "Znajdź perfumy" or typed by hand). */
const NotesFields = ({ formId }) => (
  <fieldset className={css.root}>
    <legend className={css.label}>Nuty zapachowe (opcjonalnie)</legend>
    <p className={css.hint}>Oddziel przecinkami, np. bergamotka, pieprz, ambroksan.</p>
    <FieldTextInput
      id={`${formId}refumeNutyGlowy`}
      name="refumeNutyGlowy"
      type="text"
      label="Nuty głowy"
    />
    <FieldTextInput
      id={`${formId}refumeNutySerca`}
      name="refumeNutySerca"
      type="text"
      label="Nuty serca"
    />
    <FieldTextInput
      id={`${formId}refumeNutyBazy`}
      name="refumeNutyBazy"
      type="text"
      label="Nuty bazy"
    />
  </fieldset>
);

export default NotesFields;
