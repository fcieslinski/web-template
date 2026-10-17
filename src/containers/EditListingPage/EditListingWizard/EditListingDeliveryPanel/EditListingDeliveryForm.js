import React, { useEffect } from 'react';
import { Form as FinalForm } from 'react-final-form';
import classNames from 'classnames';

// Import configs and util modules
import { FormattedMessage, useIntl } from '../../../../util/reactIntl';
import { propTypes } from '../../../../util/types';
import { displayDeliveryPickup, displayDeliveryShipping } from '../../../../util/configHelpers';
import {
  autocompleteSearchRequired,
  autocompletePlaceSelected,
  composeValidators,
} from '../../../../util/validators';
import {
  REFUME_PARCEL_SIZES,
  getCarriersForSize,
  formatCarrierOption,
} from '../../../../util/refumeShipping';

// Import shared components
import {
  Form,
  FieldLocationAutocompleteInput,
  Button,
  FieldTextInput,
  FieldCheckbox,
  FieldRadioButton,
} from '../../../../components';

// Import modules from this directory
import css from './EditListingDeliveryForm.module.css';

const identity = v => v;

/**
 * The EditListingDeliveryForm component.
 *
 * @component
 * @param {Object} props - The component props
 * @param {string} props.formId - The form ID
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {Function} props.onSubmit - The submit function
 * @param {string} props.saveActionMsg - The save action message
 * @param {Object} props.selectedPlace - The selected place
 * @param {string} props.marketplaceCurrency - The marketplace currency
 * @param {boolean} props.hasStockInUse - Whether the stock is in use
 * @param {boolean} props.disabled - Whether the form is disabled
 * @param {boolean} props.ready - Whether the form is ready
 * @param {boolean} props.updated - Whether the form is updated
 * @param {boolean} props.updateInProgress - Whether the form is in progress
 * @param {Object} props.fetchErrors - The fetch errors
 * @param {propTypes.error} [props.fetchErrors.showListingsError] - The show listings error
 * @param {propTypes.error} [props.fetchErrors.updateListingError] - The update listing error
 * @param {boolean} props.autoFocus - Whether the form is auto focused
 * @returns {JSX.Element} The EditListingDeliveryForm component
 */
export const EditListingDeliveryForm = props => (
  <FinalForm
    {...props}
    render={formRenderProps => {
      const {
        formId = 'EditListingDeliveryForm',
        form,
        autoFocus,
        className,
        disabled,
        ready,
        handleSubmit,
        pristine,
        invalid,
        listingTypeConfig,
        marketplaceCurrency,
        saveActionMsg,
        updated,
        updateInProgress,
        fetchErrors,
        values,
      } = formRenderProps;
      const intl = useIntl();

      // This is a bug fix for Final Form.
      // Without this, React will return a warning:
      //   "Cannot update a component (`ForwardRef(Field)`)
      //   while rendering a different component (`ForwardRef(Field)`)"
      // This seems to happen because validation calls listeneres and
      // that causes state to change inside final-form.
      // https://github.com/final-form/react-final-form/issues/751
      //
      // TODO: it might not be worth the trouble to show these fields as disabled,
      // if this fix causes trouble in future dependency updates.
      const { pauseValidation, resumeValidation } = form;
      pauseValidation(false);
      useEffect(() => resumeValidation(), [values]);

      const displayShipping = displayDeliveryShipping(listingTypeConfig);
      const displayPickup = displayDeliveryPickup(listingTypeConfig);
      const displayMultipleDelivery = displayShipping && displayPickup;
      const shippingEnabled = displayShipping && values.deliveryOptions?.includes('shipping');
      const pickupEnabled = displayPickup && values.deliveryOptions?.includes('pickup');

      const addressRequiredMessage = intl.formatMessage({
        id: 'EditListingDeliveryForm.addressRequired',
      });
      const addressNotRecognizedMessage = intl.formatMessage({
        id: 'EditListingDeliveryForm.addressNotRecognized',
      });

      const optionalText = intl.formatMessage({
        id: 'EditListingDeliveryForm.optionalText',
      });

      const { updateListingError, showListingsError } = fetchErrors || {};

      const classes = classNames(css.root, className);
      const submitReady = (updated && pristine) || ready;
      const submitInProgress = updateInProgress;
      // Refume: with shipping, the seller must pick a parcel size and keep at least one carrier
      const parcelSize = values.gabaryt;
      const carriersForSize = getCarriersForSize(parcelSize);
      const selectedCarriers = (values.shippingCarriers || []).filter(key =>
        carriersForSize.some(c => c.key === key)
      );
      const shippingSetupError = !shippingEnabled
        ? null
        : !parcelSize
        ? 'Wybierz gabaryt paczki.'
        : selectedCarriers.length === 0
        ? 'Zostaw zaznaczoną przynajmniej jedną opcję dostawy.'
        : null;

      const submitDisabled =
        invalid ||
        disabled ||
        submitInProgress ||
        (!shippingEnabled && !pickupEnabled) ||
        !!shippingSetupError;

      const shippingLabel = intl.formatMessage({ id: 'EditListingDeliveryForm.shippingLabel' });
      const pickupLabel = intl.formatMessage({ id: 'EditListingDeliveryForm.pickupLabel' });

      const pickupClasses = classNames({
        [css.deliveryOption]: displayMultipleDelivery,
        [css.disabled]: !pickupEnabled,
        [css.hidden]: !displayPickup,
      });
      const shippingClasses = classNames({
        [css.deliveryOption]: displayMultipleDelivery,
        [css.disabled]: !shippingEnabled,
        [css.hidden]: !displayShipping,
      });

      return (
        <Form className={classes} onSubmit={handleSubmit}>
          <FieldCheckbox
            id={formId ? `${formId}.pickup` : 'pickup'}
            className={classNames(css.deliveryCheckbox, { [css.hidden]: !displayMultipleDelivery })}
            name="deliveryOptions"
            label={pickupLabel}
            value="pickup"
          />
          <div className={pickupClasses}>
            {updateListingError ? (
              <p className={css.error}>
                <FormattedMessage id="EditListingDeliveryForm.updateFailed" />
              </p>
            ) : null}

            {showListingsError ? (
              <p className={css.error}>
                <FormattedMessage id="EditListingDeliveryForm.showListingFailed" />
              </p>
            ) : null}

            <FieldLocationAutocompleteInput
              disabled={!pickupEnabled}
              rootClassName={css.input}
              inputClassName={css.locationAutocompleteInput}
              iconClassName={css.locationAutocompleteInputIcon}
              predictionsClassName={css.predictionsRoot}
              validClassName={css.validLocation}
              autoFocus={autoFocus}
              name="location"
              id={`${formId}.location`}
              label={intl.formatMessage({ id: 'EditListingDeliveryForm.address' })}
              placeholder={intl.formatMessage({
                id: 'EditListingDeliveryForm.addressPlaceholder',
              })}
              useDefaultPredictions={false}
              format={identity}
              valueFromForm={values.location}
              validate={
                pickupEnabled
                  ? composeValidators(
                      autocompleteSearchRequired(addressRequiredMessage),
                      autocompletePlaceSelected(addressNotRecognizedMessage)
                    )
                  : () => {}
              }
              hideErrorMessage={!pickupEnabled}
              // Whatever parameters are being used to calculate
              // the validation function need to be combined in such
              // a way that, when they change, this key prop
              // changes, thus reregistering this field (and its
              // validation function) with Final Form.
              // See example: https://codesandbox.io/s/changing-field-level-validators-zc8ei
              key={pickupEnabled ? 'locationValidation' : 'noLocationValidation'}
            />

            <FieldTextInput
              className={css.input}
              type="text"
              name="building"
              id={formId ? `${formId}.building` : 'building'}
              label={intl.formatMessage(
                { id: 'EditListingDeliveryForm.building' },
                { optionalText }
              )}
              placeholder={intl.formatMessage({
                id: 'EditListingDeliveryForm.buildingPlaceholder',
              })}
              disabled={!pickupEnabled}
            />
          </div>

          <FieldCheckbox
            id={formId ? `${formId}.shipping` : 'shipping'}
            className={classNames(css.deliveryCheckbox, { [css.hidden]: !displayMultipleDelivery })}
            name="deliveryOptions"
            label={shippingLabel}
            value="shipping"
          />

          {/* Refume: sellers don't set shipping prices. They pick the parcel size and which of
              the marketplace's fixed-price carriers for that size they offer; the buyer picks
              one of those at checkout (see src/util/refumeShipping.js). */}
          <div className={shippingClasses}>
            <fieldset className={css.refumeFieldset} disabled={!shippingEnabled}>
              <legend className={css.refumeLegend}>Gabaryt paczki</legend>
              <div className={css.refumeSizes}>
                {REFUME_PARCEL_SIZES.map(size => (
                  <FieldRadioButton
                    key={size.key}
                    id={`${formId}.gabaryt.${size.key}`}
                    name="gabaryt"
                    value={size.key}
                    label={size.label}
                    showAsRequired={shippingEnabled && !parcelSize}
                  />
                ))}
              </div>
            </fieldset>

            {parcelSize ? (
              <fieldset className={css.refumeFieldset} disabled={!shippingEnabled}>
                <legend className={css.refumeLegend}>Opcje dostawy dla kupującego</legend>
                <p className={css.refumeShippingInfo}>
                  Odznacz te, których nie chcesz obsługiwać. Kupujący wybierze jedną z zaznaczonych
                  i za nią zapłaci.
                </p>
                {carriersForSize.map(carrier => (
                  <FieldCheckbox
                    key={carrier.key}
                    id={`${formId}.shippingCarriers.${carrier.key}`}
                    name="shippingCarriers"
                    value={carrier.key}
                    label={formatCarrierOption(carrier, intl, marketplaceCurrency)}
                  />
                ))}
              </fieldset>
            ) : null}

            {shippingSetupError ? (
              <p className={css.refumeShippingError} role="alert">
                {shippingSetupError}
              </p>
            ) : null}
          </div>

          <Button
            className={css.submitButton}
            type="submit"
            inProgress={submitInProgress}
            disabled={submitDisabled}
            ready={submitReady}
          >
            {saveActionMsg}
          </Button>
        </Form>
      );
    }}
  />
);

export default EditListingDeliveryForm;
