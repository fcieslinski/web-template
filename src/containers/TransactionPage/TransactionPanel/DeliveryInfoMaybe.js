import React from 'react';
import classNames from 'classnames';

import getCountryCodes from '../../../translations/countryCodes';
import { FormattedMessage } from '../../../util/reactIntl';
import { Heading } from '../../../components';
import { getShippingCarrier } from '../../../util/refumeShipping';

import AddressLinkMaybe from './AddressLinkMaybe';

import css from './TransactionPanel.module.css';

// Functional component as a helper to build ActivityFeed section
const DeliveryInfoMaybe = props => {
  const { className, rootClassName, protectedData, listing, locale } = props;
  const classes = classNames(rootClassName || css.deliveryInfoContainer, className);
  const deliveryMethod = protectedData?.deliveryMethod;
  const isShipping = deliveryMethod === 'shipping';
  const isPickup = deliveryMethod === 'pickup';

  if (isPickup) {
    const pickupLocation = listing?.attributes?.publicData?.location || {};
    return (
      <div className={classes}>
        <Heading as="h3" rootClassName={css.sectionHeading}>
          <FormattedMessage id="TransactionPanel.pickupInfoHeading" />
        </Heading>
        <div className={css.pickupInfoContent}>
          <AddressLinkMaybe
            linkRootClassName={css.pickupAddress}
            location={pickupLocation}
            geolocation={listing?.attributes?.geolocation}
            showAddress={true}
          />
        </div>
      </div>
    );
  } else if (isShipping) {
    const { name, phoneNumber, address } = protectedData?.shippingDetails || {};
    const { line1, line2, city, postalCode, state, country: countryCode } = address || {};
    const phoneMaybe = !!phoneNumber ? (
      <>
        {phoneNumber}
        <br />
      </>
    ) : null;

    const countryCodes = getCountryCodes(locale);
    const countryInfo = countryCodes.find(c => c.code === countryCode);
    const country = countryInfo?.name;

    // Refume: the shipping option and parcel locker / pickup point the buyer chose
    const carrier = getShippingCarrier(protectedData?.shippingCarrier);
    const rechosen = protectedData?.refumePunkt;
    const pointCode = rechosen?.kod || protectedData?.shippingPointCode;
    const pointName = rechosen ? rechosen.nazwa : protectedData?.shippingPointName;
    const carrierInfoMaybe = carrier ? (
      <p className={css.shippingInfoContent}>
        <strong>{carrier.label}</strong>
        {carrier.needsPickupPoint && pointCode ? (
          <>
            <br />
            {pointName ? (
              <>
                {pointName}
                <br />
              </>
            ) : null}
            Kod punktu: {pointCode}
          </>
        ) : null}
      </p>
    ) : null;

    return (
      <div className={classes}>
        <Heading as="h3" rootClassName={css.sectionHeading}>
          <FormattedMessage id="TransactionPanel.shippingInfoHeading" />
        </Heading>
        {carrierInfoMaybe}
        <div className={css.shippingInfoContent}>
          {name}
          <br />
          {phoneMaybe}
          {line1}
          {line2 ? `, ${line2}` : ''}
          <br />
          {postalCode}, {city}
          <br />
          {state ? `${state}, ` : ''}
          {country}
          <br />
        </div>
      </div>
    );
  }
  return null;
};

export default DeliveryInfoMaybe;
