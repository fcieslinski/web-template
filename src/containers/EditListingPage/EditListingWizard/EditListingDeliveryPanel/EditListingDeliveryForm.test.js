import React, { act } from 'react';
import '@testing-library/jest-dom';

import { fakeIntl } from '../../../../util/testData';
import { renderWithProviders as render, testingLibrary } from '../../../../util/testHelpers';

import EditListingDeliveryForm from './EditListingDeliveryForm';

const { screen, userEvent } = testingLibrary;

const noop = () => null;

describe('EditListingDeliveryForm', () => {
  it('Refume: enabling shipping shows the fixed carrier options and activates submit', async () => {
    const user = userEvent.setup();
    const saveActionMsg = 'Save location';
    render(
      <EditListingDeliveryForm
        intl={fakeIntl}
        dispatch={noop}
        onSubmit={noop}
        saveActionMsg={saveActionMsg}
        marketplaceCurrency="USD"
        allowOrdersOfMultipleItems={true}
        updated={false}
        updateInProgress={false}
        disabled={false}
        ready={false}
      />
    );

    // Pickup fields
    const address = 'EditListingDeliveryForm.address';
    expect(screen.getByText(address)).toBeInTheDocument();

    const building = 'EditListingDeliveryForm.building';
    expect(screen.getByText(building)).toBeInTheDocument();

    // Test that save button is disabled at first
    expect(screen.getByRole('button', { name: saveActionMsg })).toBeDisabled();

    // Enable shipping: no price fields, the marketplace's fixed carrier options are listed
    await user.click(screen.getByLabelText(/EditListingDeliveryForm.shippingLabel/i));
    expect(screen.queryByText('EditListingDeliveryForm.shippingOneItemLabel')).not.toBeInTheDocument();
    expect(screen.getByText(/InPost Paczkomat/)).toBeInTheDocument();
    expect(screen.getByText(/Kurier DPD/)).toBeInTheDocument();
    expect(screen.getByText(/DPD Pickup/)).toBeInTheDocument();

    // Test that save button is enabled
    expect(screen.getByRole('button', { name: saveActionMsg })).toBeEnabled();
  });
});
