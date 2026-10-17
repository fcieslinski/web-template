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
        initialValues={{ shippingCarriers: ['orlen', 'inpost', 'dpd-pickup', 'pocztex'] }}
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

    // Enable shipping: no price fields; the seller picks a parcel size first
    await user.click(screen.getByLabelText(/EditListingDeliveryForm.shippingLabel/i));
    expect(screen.queryByText('EditListingDeliveryForm.shippingOneItemLabel')).not.toBeInTheDocument();
    expect(screen.getByText('Wybierz gabaryt paczki.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: saveActionMsg })).toBeDisabled();

    // Size S shows its four carriers, all offered by default
    await user.click(screen.getByLabelText(/S – mały/));
    expect(screen.getByLabelText(/Orlen Paczka/)).toBeChecked();
    expect(screen.getByLabelText(/InPost Paczkomat/)).toBeChecked();
    expect(screen.getByLabelText(/DPD Pickup/)).toBeChecked();
    expect(screen.getByLabelText(/Pocztex Kurier/)).toBeChecked();

    // Size L only has Pocztex; unchecking it leaves nothing, which blocks saving
    await user.click(screen.getByLabelText(/L – duży/));
    expect(screen.queryByLabelText(/InPost Paczkomat/)).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(/Pocztex Kurier/));
    expect(screen.getByRole('button', { name: saveActionMsg })).toBeDisabled();
    await user.click(screen.getByLabelText(/Pocztex Kurier/));

    // Test that save button is enabled
    expect(screen.getByRole('button', { name: saveActionMsg })).toBeEnabled();
  });
});
