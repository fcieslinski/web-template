import React, { useMemo, useRef, useState } from 'react';
import { Form as FinalForm, Field } from 'react-final-form';
import arrayMutators from 'final-form-arrays';
import { useDispatch } from 'react-redux';
import classNames from 'classnames';

import appSettings from '../../../config/settings';
import { useIntl } from '../../../util/reactIntl';
import { types as sdkTypes } from '../../../util/sdkLoader';
import { formatMoney } from '../../../util/currency';
import * as validators from '../../../util/validators';
import { EXTENDED_DATA_SCHEMA_TYPES, LISTING_STATE_DRAFT } from '../../../util/types';
import {
  isFieldForCategory,
  isFieldForListingType,
  pickCategoryFields,
} from '../../../util/fieldHelpers';
import { createResourceLocatorString } from '../../../util/routes';
import { createSlug } from '../../../util/urlHelpers';
import { useRouteConfiguration } from '../../../context/routeConfigurationContext';
import { canonicalBrand } from '../../../util/refumeBrands';
import { REFUME_PARCEL_SIZES, getCarriersForSize, formatCarrierOption } from '../../../util/refumeShipping';
import { uploadProofOfPurchase } from '../../../ducks/refumeProof.duck';
import { notifyScentRequests } from '../../../util/api';
import {
  FieldTextInput,
  FieldSelect,
  FieldCurrencyInput,
  FieldCheckbox,
  FieldRadioButton,
  CustomExtendedDataField,
  PrimaryButton,
} from '../../../components';

import {
  pickListingFieldsData,
  initialValuesForListingFields,
  setNoAvailabilityForUnbookableListings,
} from '../EditListingWizard/EditListingDetailsPanel/EditListingDetailsPanel';
import PerfumeLookup from '../EditListingWizard/EditListingDetailsPanel/PerfumeLookup';
import NotesFields from '../EditListingWizard/EditListingDetailsPanel/NotesFields';
import ListingImage from '../EditListingWizard/EditListingPhotosPanel/ListingImage';
import ProofOfPurchase from '../EditListingWizard/EditListingPhotosPanel/ProofOfPurchase';

import css from './RefumeListingEditor.module.css';

const { Money } = sdkTypes;
const FORM_ID = 'RefumeListingEditor';
const TITLE_MAX = 60;
const MAX_IMAGES = 12;

const toList = (value, max) =>
  (Array.isArray(value) ? value : [])
    .map(v => String(v).trim())
    .filter(Boolean)
    .slice(0, max);

const typeInfo = conf =>
  conf
    ? {
        listingType: conf.listingType,
        transactionProcessAlias: conf.transactionType?.alias,
        unitType: conf.transactionType?.unitType,
      }
    : {};

/**
 * One step of the listing form. "open" shows the fields, "done" a short summary with "Zmień",
 * "locked" only the title (not reached yet), "static" = always open (editing a published listing).
 */
const Step = props => {
  const { id, number, title, hint, state, summary, onEdit, children, footer, optional, className } = props;
  const isOpen = state === 'open' || state === 'static';
  return (
    <section
      id={id}
      className={classNames(css.section, css.step, className, {
        [css.stepLocked]: state === 'locked',
        [css.stepDone]: state === 'done',
      })}
      aria-current={state === 'open' ? 'step' : undefined}
    >
      <div className={css.stepHeader}>
        {number ? (
          <span className={css.stepNumber} aria-hidden="true">
            {state === 'done' ? '✓' : number}
          </span>
        ) : null}
        <div className={css.stepHeading}>
          <h2 className={css.sectionTitle}>
            {title}
            {optional ? <span className={css.optional}> (opcjonalnie)</span> : null}
          </h2>
          {state === 'done' && summary ? <p className={css.stepSummary}>{summary}</p> : null}
          {isOpen && hint ? <p className={css.sectionHint}>{hint}</p> : null}
        </div>
        {state === 'done' ? (
          <button type="button" className={css.editStep} onClick={onEdit}>
            Zmień
          </button>
        ) : null}
      </div>
      {isOpen ? <div className={css.stepBody}>{children}</div> : null}
      {state === 'open' && footer ? <div className={css.stepFooter}>{footer}</div> : null}
    </section>
  );
};

/** Refume: single-choice tiles (instead of radio dots). */
const TileRadioField = ({ name, options, columns = 3, ariaLabel }) => (
  <Field name={name}>
    {({ input }) => (
      <div
        className={css.tiles}
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        role="radiogroup"
        aria-label={ariaLabel}
      >
        {options.map(o => {
          const selected = input.value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={classNames(css.tile, { [css.tileSelected]: selected })}
              onClick={() => input.onChange(o.value)}
            >
              {o.big ? <span className={css.tileBig}>{o.big}</span> : null}
              <span className={css.tileLabel}>{o.label}</span>
              {o.meta ? <span className={css.tileMeta}>{o.meta}</span> : null}
            </button>
          );
        })}
      </div>
    )}
  </Field>
);

/** Refume: multi-choice tiles (instead of checkboxes). */
const TileCheckboxField = ({ name, options, ariaLabel }) => (
  <Field name={name}>
    {({ input }) => {
      const value = Array.isArray(input.value) ? input.value : [];
      const toggle = v =>
        input.onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
      return (
        <div className={css.tilesList} role="group" aria-label={ariaLabel}>
          {options.map(o => {
            const selected = value.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={selected}
                className={classNames(css.tileRow, { [css.tileSelected]: selected })}
                onClick={() => toggle(o.value)}
              >
                <span className={css.tileCheck} aria-hidden="true">
                  {selected ? '✓' : ''}
                </span>
                <span className={css.tileLabel}>{o.label}</span>
                {o.meta ? <span className={css.tileRowMeta}>{o.meta}</span> : null}
              </button>
            );
          })}
        </div>
      );
    }}
  </Field>
);

const Section = ({ title, hint, children, className }) => (
  <section className={classNames(css.section, className)}>
    <div className={css.sectionHeader}>
      <h2 className={css.sectionTitle}>{title}</h2>
      {hint ? <p className={css.sectionHint}>{hint}</p> : null}
    </div>
    {children}
  </section>
);

/** Category selects; a deeper level appears when the chosen category has subcategories. */
const CategoryFields = ({ categories, prefix, values, formApi }) => {
  const selects = [];
  let options = categories;
  for (let level = 1; level <= 3 && options?.length; level++) {
    const name = `${prefix}${level}`;
    const current = options;
    const lvl = level;
    selects.push(
      <FieldSelect
        key={name}
        id={`${FORM_ID}.${name}`}
        name={name}
        className={css.field}
        label={level === 1 ? 'Kategoria' : 'Podkategoria'}
        validate={validators.required('Wybierz kategorię.')}
        onChange={() => {
          for (let i = lvl + 1; i <= 3; i++) formApi.change(`${prefix}${i}`, undefined);
        }}
      >
        <option value="" disabled>
          {level === 1 ? 'Wybierz kategorię' : 'Wybierz podkategorię'}
        </option>
        {current.map(c => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </FieldSelect>
    );
    const chosen = current.find(c => c.id === values[name]);
    options = chosen?.subcategories;
    if (!chosen) break;
  }
  return <div className={css.row}>{selects}</div>;
};

/** Custom fields from Console for the chosen listing type and category (brand, condition…). */
// Console fields replaced by Refume's own notes/accords pickers
const isReplacedField = fc =>
  /nut|akord|accord|note/i.test(`${fc?.key || ''}`) ||
  /nuty|akord/i.test(`${fc?.saveConfig?.label || fc?.label || ''}`);

const visibleListingFields = (listingFields, listingType, categoryIds) =>
  listingFields.filter(fc => {
    const { schemaType, scope = 'public' } = fc || {};
    return (
      !isReplacedField(fc) &&
      EXTENDED_DATA_SCHEMA_TYPES.includes(schemaType) &&
      ['public', 'private'].includes(scope) &&
      isFieldForListingType(listingType, fc) &&
      isFieldForCategory(categoryIds, fc)
    );
  });

const fieldName = fc => `${fc.scope === 'private' ? 'priv' : 'pub'}_${fc.key}`;

const ListingFields = ({ listingFields, listingType, categoryIds, intl }) =>
  visibleListingFields(listingFields, listingType, categoryIds)
    .map(fc => {
      const name = fieldName(fc);
      return (
        <CustomExtendedDataField
          key={name}
          name={name}
          fieldConfig={fc}
          defaultRequiredMessage="To pole jest wymagane."
          formId={FORM_ID}
        />
      );
    });

/**
 * Refume: the whole listing on one page — photos, perfume, details, notes, price, shipping and
 * proof of purchase — with one "Opublikuj" button. Replaces the 4-step wizard.
 */
const RefumeListingEditor = props => {
  const {
    listing,
    images = [],
    config,
    history,
    onCreateListingDraft,
    onUpdateListing,
    onPublishListingDraft,
    onImageUpload,
    onRemoveListingImage,
    locationSearch,
  } = props;
  const intl = useIntl();
  const dispatch = useDispatch();
  const routes = useRouteConfiguration();
  const [submitError, setSubmitError] = useState(null);
  const [proofFile, setProofFile] = useState(null);
  const [imageError, setImageError] = useState(null);
  // Steps: 0 photos, 1 what you sell, 2 details, 3 notes, 4 price & shipping
  // Sections appear one after another as the seller fills in the previous ones
  const revealedRef = useRef(0);

  const listingTypes = config.listing.listingTypes || [];
  const listingFields = config.listing.listingFields || [];
  const categories = config.categoryConfiguration?.categories || [];
  const categoryKey = config.categoryConfiguration?.key || 'categoryLevel';
  const currency = config.currency;
  const listingImageConfig = config.layout.listingImage;

  const attrs = listing?.attributes || {};
  const publicData = attrs.publicData || {};
  const isExisting = !!listing?.id;
  const isPublished = isExisting && attrs.state && attrs.state !== LISTING_STATE_DRAFT;
  const hasFixedType = !!publicData.listingType;

  const initialValues = useMemo(() => {
    const preselected = locationSearch?.listingType;
    const defaultType =
      publicData.listingType ||
      listingTypes.find(t => t.listingType === preselected)?.listingType ||
      listingTypes[0]?.listingType;
    const nested = pickCategoryFields(publicData, categoryKey, 1, categories);
    return {
      listingType: defaultType,
      title: attrs.title || '',
      description: attrs.description || '',
      ...nested,
      ...initialValuesForListingFields(publicData, 'public', defaultType, nested, listingFields),
      ...initialValuesForListingFields(
        attrs.privateData || {},
        'private',
        defaultType,
        nested,
        listingFields
      ),
      refumeNutyGlowy: toList(publicData.nuty?.glowy, 20),
      refumeNutySerca: toList(publicData.nuty?.serca, 20),
      refumeNutyBazy: toList(publicData.nuty?.bazy, 20),
      refumeAkordy: toList(publicData.akordy, 6),
      refumeFragellaId: publicData.fragellaId || '',
      price: attrs.price || undefined,
      gabaryt: publicData.gabaryt || undefined,
      shippingCarriers: Array.isArray(publicData.shippingCarriers)
        ? publicData.shippingCarriers
        : undefined,
    };
    // Built once per listing; edits live in the form
  }, [listing?.id?.uuid]);

  const minPrice = config.listingMinimumPriceSubUnits;
  const priceValidators = validators.composeValidators(
    validators.required('Podaj cenę.'),
    ...(minPrice
      ? [
          validators.moneySubUnitAmountAtLeast(
            `Minimalna cena to ${formatMoney(intl, new Money(minPrice, currency))}.`,
            minPrice
          ),
        ]
      : [])
  );

  const uploadingImages = images.some(img => !img.imageId && !img.attributes);

  const addImages = files => {
    setImageError(null);
    const room = MAX_IMAGES - images.length;
    Array.from(files || [])
      .slice(0, Math.max(room, 0))
      .forEach(file => {
        if (file.size > 20 * 1000 * 1000) {
          setImageError('Zdjęcie jest za duże (maks. 20 MB).');
          return;
        }
        onImageUpload({ id: `${file.name}_${Date.now()}`, file }, listingImageConfig).catch(() =>
          setImageError('Nie udało się wysłać zdjęcia. Spróbuj ponownie.')
        );
      });
  };

  const goToListing = (id, title) =>
    history.push(
      createResourceLocatorString('ListingPage', routes, { id: id.uuid, slug: createSlug(title) }, {})
    );

  const onSubmit = async values => {
    setSubmitError(null);
    if (!images.length) {
      setSubmitError('Dodaj przynajmniej jedno zdjęcie.');
      return;
    }
    if (uploadingImages) {
      setSubmitError('Poczekaj, aż zdjęcia się wyślą.');
      return;
    }

    const typeConf = listingTypes.find(t => t.listingType === values.listingType);
    const info = hasFixedType
      ? {
          listingType: publicData.listingType,
          transactionProcessAlias: publicData.transactionProcessAlias,
          unitType: publicData.unitType,
        }
      : typeInfo(typeConf);

    const nested = pickCategoryFields(values, categoryKey, 1, categories);
    const cleanedNested = {
      ...[1, 2, 3].reduce((a, i) => ({ ...a, [`${categoryKey}${i}`]: null }), {}),
      ...nested,
    };
    const publicFields = pickListingFieldsData(values, 'public', info.listingType, nested, listingFields);
    const privateFields = pickListingFieldsData(
      values,
      'private',
      info.listingType,
      nested,
      listingFields
    );
    const sizeCarriers = getCarriersForSize(values.gabaryt).map(c => c.key);
    const carriers = (values.shippingCarriers || []).filter(k => sizeCarriers.includes(k));

    const data = {
      title: values.title.trim(),
      description: values.description,
      price: values.price,
      images,
      publicData: {
        ...info,
        ...cleanedNested,
        ...publicFields,
        ...(publicFields.marka ? { marka: canonicalBrand(publicFields.marka) } : {}),
        nuty: {
          glowy: toList(values.refumeNutyGlowy, 20),
          serca: toList(values.refumeNutySerca, 20),
          bazy: toList(values.refumeNutyBazy, 20),
        },
        akordy: toList(values.refumeAkordy, 6),
        fragellaId: values.refumeFragellaId || null,
        shippingEnabled: true,
        pickupEnabled: false,
        gabaryt: values.gabaryt,
        shippingCarriers: carriers,
      },
      privateData: privateFields,
      ...setNoAvailabilityForUnbookableListings(info.transactionProcessAlias),
    };
    const hasNoStock = listing?.currentStock?.attributes?.quantity == null;
    const stockMaybe = hasNoStock ? { stockUpdate: { oldTotal: null, newTotal: 1 } } : {};

    try {
      let listingId = listing?.id;
      if (!isExisting) {
        const response = await onCreateListingDraft({ ...data, ...stockMaybe }, config);
        listingId = response.data.data.id;
      } else {
        await onUpdateListing('details', { id: listingId, ...data, ...stockMaybe }, config);
      }
      if (proofFile) {
        await dispatch(uploadProofOfPurchase({ listingId, file: proofFile })).catch(() => null);
      }
      if (!isPublished) {
        // The page redirects to the new listing once it's published
        await onPublishListingDraft(listingId);
        // Let people waiting for this perfume know ("Poszukiwane")
        notifyScentRequests({ listingId }).catch(() => null);
      } else {
        goToListing(listingId, data.title);
      }
    } catch (e) {
      const apiError = e?.apiErrors?.[0] || e?.error?.apiErrors?.[0];
      const needsPayout = /stripe|payout/i.test(JSON.stringify(apiError || e?.message || ''));
      setSubmitError(
        needsPayout
          ? 'Przed publikacją uzupełnij dane do wypłat w ustawieniach konta.'
          : 'Nie udało się zapisać ogłoszenia. Sprawdź pola i spróbuj ponownie.'
      );
    }
  };

  return (
    <FinalForm
      onSubmit={onSubmit}
      mutators={{ ...arrayMutators }}
      initialValues={initialValues}
      initialValuesEqual={(a, b) => JSON.stringify(a) === JSON.stringify(b)}
      validate={values => {
        const sizeCarriers = getCarriersForSize(values.gabaryt).map(c => c.key);
        const chosen = (values.shippingCarriers || []).filter(k => sizeCarriers.includes(k));
        return !values.gabaryt
          ? { gabaryt: 'Wybierz gabaryt paczki.' }
          : chosen.length === 0
          ? { shippingCarriers: 'Zaznacz przynajmniej jednego przewoźnika.' }
          : {};
      }}
      render={({ handleSubmit, values, form, submitting, hasValidationErrors, submitFailed, errors = {} }) => {
        const nested = pickCategoryFields(values, categoryKey, 1, categories);
        const categoryIds = Object.values(nested);
        const carriersForSize = getCarriersForSize(values.gabaryt);
        const chosenCarriers = (values.shippingCarriers || []).filter(k =>
          carriersForSize.some(c => c.key === k)
        );
        const shippingError = !values.gabaryt
          ? 'Wybierz gabaryt paczki.'
          : chosenCarriers.length === 0
          ? 'Zaznacz przynajmniej jednego przewoźnika.'
          : null;

        const currentListingType = hasFixedType ? publicData.listingType : values.listingType;
        const detailFields = visibleListingFields(listingFields, currentListingType, categoryIds);
        const detailFieldNames = detailFields.map(fieldName);
        const detailsSummary = detailFields
          .map(fc => {
            const v = values[fieldName(fc)];
            if (v == null || v === '') return null;
            const opt = (fc.enumOptions || []).find(o => `${o.option}` === `${v}`);
            return opt ? opt.label : Array.isArray(v) ? null : String(v);
          })
          .filter(Boolean)
          .slice(0, 4)
          .join(' · ');
        const notesCount = ['refumeNutyGlowy', 'refumeNutySerca', 'refumeNutyBazy'].reduce(
          (n, k) => n + (values[k] || []).length,
          0
        );
        const notesSummary =
          [
            (values.refumeAkordy || []).join(', '),
            notesCount ? `${notesCount} nut` : null,
          ]
            .filter(Boolean)
            .join(' · ') || 'Pominięto';

        // Editing a published listing: everything visible. New listing: the next section
        // appears once the previous one is filled in (sections never disappear again).
        const registered = form.getRegisteredFields();
        const basicsNames = ['title', 'description', `${categoryKey}1`, `${categoryKey}2`, `${categoryKey}3`];
        const basicsOk =
          !!values.title?.trim() && !!values.description?.trim() && basicsNames.every(n => !errors[n]);
        const detailsReady =
          detailFieldNames.every(n => registered.includes(n)) &&
          detailFieldNames.every(n => !errors[n]);
        let revealed = 1;
        if (basicsOk) revealed = 2;
        if (revealed >= 2 && detailsReady) revealed = 4;
        if (isPublished) revealed = 4;
        revealedRef.current = Math.max(revealedRef.current, revealed);
        const shown = i => i <= revealedRef.current;
        const stepState = () => 'static';
        const openStep = () => {};
        const nextButton = () => null;
        const allStepsReached = revealedRef.current >= 4;
        const nextHint =
          revealedRef.current === 1
            ? 'Uzupełnij kategorię, tytuł i opis — dalsze pola pojawią się poniżej.'
            : revealedRef.current === 2
            ? 'Uzupełnij wymagane szczegóły — potem cena i wysyłka.'
            : null;

        return (
          <form className={css.root} onSubmit={handleSubmit}>
            <header className={css.header}>
              <h1 className={css.title}>{isPublished ? 'Edytuj ogłoszenie' : 'Dodaj ogłoszenie'}</h1>
              <p className={css.lead}>
                {isPublished
                  ? 'Zmień, co chcesz, i zapisz.'
                  : 'Wypełniaj od góry — kolejne sekcje pojawią się same.'}
              </p>
            </header>

            <Step
              id="step-0"
              title="Zdjęcia"
              hint="Dodaj do 12 zdjęć. Pierwsze będzie zdjęciem głównym. Pokaż flakon, poziom zapachu i kod batch."
              state={stepState(0)}
              summary={`${images.length} ${images.length === 1 ? 'zdjęcie' : images.length < 5 ? 'zdjęcia' : 'zdjęć'}`}
              onEdit={() => openStep(0)}
              footer={nextButton(0, [], () =>
                !images.length
                  ? 'Dodaj przynajmniej jedno zdjęcie.'
                  : uploadingImages
                  ? 'Poczekaj, aż zdjęcia się wyślą.'
                  : null
              )}
            >
              <div className={css.images}>
                {images.map((image, i) => (
                  <ListingImage
                    key={image?.id?.uuid || image?.id}
                    image={image}
                    className={css.thumb}
                    savedImageAltText="Zdjęcie ogłoszenia"
                    onRemoveImage={() => onRemoveListingImage(image?.id)}
                    hideMoveControls
                    isCoverImage={i === 0}
                    currentPositionMessage={`Zdjęcie ${i + 1} z ${images.length}`}
                    aspectWidth={listingImageConfig.aspectWidth}
                    aspectHeight={listingImageConfig.aspectHeight}
                    variantPrefix={listingImageConfig.variantPrefix}
                  />
                ))}
                {images.length < MAX_IMAGES ? (
                  <label className={css.addImage} htmlFor={`${FORM_ID}.images`}>
                    <span className={css.addImagePlus} aria-hidden="true">
                      +
                    </span>
                    Dodaj zdjęcia
                    <input
                      id={`${FORM_ID}.images`}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className={css.hiddenInput}
                      onChange={e => {
                        addImages(e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </label>
                ) : null}
              </div>
              {imageError ? <p className={css.error}>{imageError}</p> : null}
            </Step>

            <Step
              id="step-1"
              title="Co sprzedajesz?"
              hint="Wpisz nazwę perfum, a uzupełnimy resztę za Ciebie."
              state={stepState(1)}
              summary={values.title}
              onEdit={() => openStep(1)}
              footer={nextButton(1, [
                'listingType',
                `${categoryKey}1`,
                `${categoryKey}2`,
                `${categoryKey}3`,
                'title',
                'description',
              ])}
            >
              {!hasFixedType && listingTypes.length > 1 ? (
                <fieldset className={css.typeGroup}>
                  <legend className={css.label}>Rodzaj ogłoszenia</legend>
                  <TileRadioField
                    name="listingType"
                    ariaLabel="Rodzaj ogłoszenia"
                    columns={Math.min(listingTypes.length, 3)}
                    options={listingTypes.map(t => ({ value: t.listingType, label: t.label || t.listingType }))}
                  />
                </fieldset>
              ) : null}

              <PerfumeLookup formApi={form} listingFieldsConfig={listingFields} />

              {categories.length ? (
                <CategoryFields
                  categories={categories}
                  prefix={categoryKey}
                  values={values}
                  formApi={form}
                />
              ) : null}

              <FieldTextInput
                id={`${FORM_ID}.title`}
                name="title"
                type="text"
                className={css.field}
                label="Tytuł"
                placeholder="np. Dior Sauvage EDT 100 ml"
                maxLength={TITLE_MAX}
                validate={validators.composeValidators(
                  validators.required('Podaj tytuł.'),
                  validators.maxLength(`Maksymalnie ${TITLE_MAX} znaków.`, TITLE_MAX)
                )}
              />
              <FieldTextInput
                id={`${FORM_ID}.description`}
                name="description"
                type="textarea"
                className={css.field}
                label="Opis"
                placeholder="Stan flakonu, ile zostało, skąd pochodzi, czy jest pudełko…"
                validate={validators.required('Dodaj krótki opis.')}
              />
            </Step>

            {shown(2) ? (
            <Step
              className={css.reveal}
              id="step-2"
              title="Szczegóły"
              hint="Marka, stan, pojemność i inne informacje, po których kupujący filtrują oferty."
              state={stepState(2)}
              summary={detailsSummary}
              onEdit={() => openStep(2)}
              footer={nextButton(2, detailFieldNames)}
            >
              <div className={css.fieldsGrid}>
                <ListingFields
                  listingFields={listingFields}
                  listingType={currentListingType}
                  categoryIds={categoryIds}
                  intl={intl}
                />
              </div>
            </Step>
            ) : null}

            {shown(3) ? (
            <Step
              className={css.reveal}
              id="step-3"
              title="Nuty zapachowe"
              optional
              hint="Pomagają kupującym znaleźć zapach. Jeśli wybrałeś perfumy z bazy, są już uzupełnione."
              state={stepState(3)}
              summary={notesSummary}
              onEdit={() => openStep(3)}
              footer={nextButton(3, [], null, 'Dalej')}
            >
              <div className={css.notesSection}>
                <NotesFields formId={FORM_ID} />
              </div>
            </Step>
            ) : null}

            {shown(4) ? (
            <Step
              className={css.reveal}
              id="step-4"
              title="Cena i wysyłka"
              state={stepState(4)}
              onEdit={() => openStep(4)}
            >
              <div className={css.twoCols}>
                <div>
                  <h3 className={css.subTitle}>Cena</h3>
                  <FieldCurrencyInput
                    id={`${FORM_ID}.price`}
                    name="price"
                    className={css.field}
                    label="Cena (zł)"
                    placeholder="0,00"
                    currencyConfig={appSettings.getCurrencyFormatting(currency)}
                    validate={priceValidators}
                  />
                  <p className={css.note}>
                    Dostaniesz pełną kwotę. Kupujący dopłaca Ochronę Kupującego i dostawę.
                  </p>
                </div>
                <div>
                  <h3 className={css.subTitle}>Wysyłka</h3>
                  <p className={css.sectionHint}>Gabaryt paczki i przewoźnicy, których obsługujesz.</p>
                  <TileRadioField
                    name="gabaryt"
                    ariaLabel="Gabaryt paczki"
                    options={REFUME_PARCEL_SIZES.map(size => {
                      const prices = getCarriersForSize(size.key).map(c => c.priceInSubunits);
                      const min = prices.length ? Math.min(...prices) : null;
                      const [, desc] = size.label.split('–').map(x => x.trim());
                      return {
                        value: size.key,
                        big: size.key,
                        label: desc || size.label,
                        meta: min != null ? `od ${(min / 100).toFixed(2).replace('.', ',')} zł` : null,
                      };
                    })}
                  />
                  {values.gabaryt ? (
                    <>
                      <p className={css.tilesHeading}>Przewoźnicy, których obsługujesz</p>
                      <TileCheckboxField
                        name="shippingCarriers"
                        ariaLabel="Przewoźnicy"
                        options={carriersForSize.map(c => ({
                          value: c.key,
                          label: c.label,
                          meta: `${(c.priceInSubunits / 100).toFixed(2).replace('.', ',')} zł`,
                        }))}
                      />
                    </>
                  ) : null}
                  {submitFailed && shippingError ? <p className={css.error}>{shippingError}</p> : null}
                </div>
              </div>

              <div className={css.proofBlock}>
                <h3 className={css.subTitle}>
                  Dowód zakupu <span className={css.optional}>(opcjonalnie)</span>
                </h3>
                <p className={css.sectionHint}>
                  Paragon lub faktura. Zobaczy je tylko moderator. Po zatwierdzeniu oferta dostanie
                  znacznik „Zweryfikowano dowodem zakupu”.
                </p>
                {isExisting ? (
                  <ProofOfPurchase listing={listing} hideHeading />
                ) : (
                  <label className={css.proofButton} htmlFor={`${FORM_ID}.proof`}>
                    {proofFile ? `Wybrano: ${proofFile.name}` : 'Dodaj zdjęcie dowodu zakupu'}
                    <input
                      id={`${FORM_ID}.proof`}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className={css.hiddenInput}
                      onChange={e => setProofFile(e.target.files?.[0] || null)}
                    />
                  </label>
                )}
              </div>
            </Step>
            ) : null}

            {nextHint && !isPublished ? <p className={css.nextHint}>{nextHint}</p> : null}

            {allStepsReached ? (
            <div className={css.submitBar}>
              {submitError ? (
                <p className={css.error} role="alert">
                  {submitError}
                </p>
              ) : submitFailed && hasValidationErrors ? (
                <p className={css.error} role="alert">
                  Uzupełnij zaznaczone pola.
                </p>
              ) : null}
              <PrimaryButton
                type="submit"
                className={css.submit}
                inProgress={submitting}
                disabled={submitting || uploadingImages}
              >
                {isPublished ? 'Zapisz zmiany' : 'Opublikuj ogłoszenie'}
              </PrimaryButton>
            </div>
            ) : null}
          </form>
        );
      }}
    />
  );
};

export default RefumeListingEditor;
