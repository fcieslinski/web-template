import React, { useMemo, useState } from 'react';
import { Form as FinalForm } from 'react-final-form';
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
const ListingFields = ({ listingFields, listingType, categoryIds, intl }) =>
  listingFields
    .filter(fc => {
      const { schemaType, scope = 'public' } = fc || {};
      return (
        EXTENDED_DATA_SCHEMA_TYPES.includes(schemaType) &&
        ['public', 'private'].includes(scope) &&
        isFieldForListingType(listingType, fc) &&
        isFieldForCategory(categoryIds, fc)
      );
    })
    .map(fc => {
      const name = `${fc.scope === 'private' ? 'priv' : 'pub'}_${fc.key}`;
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
      render={({ handleSubmit, values, form, submitting, hasValidationErrors, submitFailed }) => {
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

        return (
          <form className={css.root} onSubmit={handleSubmit}>
            <header className={css.header}>
              <h1 className={css.title}>{isPublished ? 'Edytuj ogłoszenie' : 'Dodaj ogłoszenie'}</h1>
              <p className={css.lead}>Wszystko na jednej stronie. Zajmie Ci to około 2 minut.</p>
            </header>

            <Section
              title="Zdjęcia"
              hint="Dodaj do 12 zdjęć. Pierwsze będzie zdjęciem głównym. Pokaż flakon, poziom zapachu i kod batch."
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
            </Section>

            <Section title="Co sprzedajesz?">
              {!hasFixedType && listingTypes.length > 1 ? (
                <fieldset className={css.typeGroup}>
                  <legend className={css.label}>Rodzaj ogłoszenia</legend>
                  <div className={css.pills}>
                    {listingTypes.map(t => (
                      <FieldRadioButton
                        key={t.listingType}
                        id={`${FORM_ID}.listingType.${t.listingType}`}
                        name="listingType"
                        value={t.listingType}
                        label={t.label || t.listingType}
                      />
                    ))}
                  </div>
                </fieldset>
              ) : null}

              {categories.length ? (
                <CategoryFields
                  categories={categories}
                  prefix={categoryKey}
                  values={values}
                  formApi={form}
                />
              ) : null}

              <PerfumeLookup formApi={form} listingFieldsConfig={listingFields} />

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
            </Section>

            <Section title="Szczegóły">
              <div className={css.fieldsGrid}>
                <ListingFields
                  listingFields={listingFields}
                  listingType={hasFixedType ? publicData.listingType : values.listingType}
                  categoryIds={categoryIds}
                  intl={intl}
                />
              </div>
            </Section>

            <Section title="Nuty zapachowe" className={css.notesSection}>
              <NotesFields formId={FORM_ID} />
            </Section>

            <div className={css.twoCols}>
              <Section title="Cena">
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
              </Section>

              <Section title="Wysyłka" hint="Wybierz gabaryt paczki i przewoźników, których obsługujesz.">
                <div className={css.pills}>
                  {REFUME_PARCEL_SIZES.map(size => (
                    <FieldRadioButton
                      key={size.key}
                      id={`${FORM_ID}.gabaryt.${size.key}`}
                      name="gabaryt"
                      value={size.key}
                      label={size.label}
                    />
                  ))}
                </div>
                {values.gabaryt ? (
                  <div className={css.carriers}>
                    {carriersForSize.map(c => (
                      <FieldCheckbox
                        key={c.key}
                        id={`${FORM_ID}.shippingCarriers.${c.key}`}
                        name="shippingCarriers"
                        value={c.key}
                        label={formatCarrierOption(c, intl, currency)}
                      />
                    ))}
                  </div>
                ) : null}
                {submitFailed && shippingError ? <p className={css.error}>{shippingError}</p> : null}
              </Section>
            </div>

            <Section
              title="Dowód zakupu (opcjonalnie)"
              hint="Paragon lub faktura. Zobaczy je tylko moderator. Po zatwierdzeniu oferta dostanie znacznik „Zweryfikowano dowodem zakupu”."
            >
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
            </Section>

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
          </form>
        );
      }}
    />
  );
};

export default RefumeListingEditor;
