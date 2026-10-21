import React, { useState } from 'react';

import SenderDetailsForm, {
  SENDER_KEY,
  hasSenderDetails,
} from '../../../components/RefumeShipment/SenderDetailsForm';
import RefumeModal from './RefumeModal';

import css from './BundleSettings.module.css';

/** Refume: the seller's sender details for shipping labels (private, only on the label). */
const SenderSettings = ({ currentUser }) => {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const data = currentUser?.attributes?.profile?.privateData?.[SENDER_KEY];
  const complete = hasSenderDetails(data);
  const summary = complete
    ? `${data.imie}, ${data.ulica}, ${data.kod} ${data.miasto} · tel. ${data.telefon}`
    : 'Uzupełnij, żeby etykieta wysyłkowa tworzyła się sama zaraz po opłaceniu zamówienia.';

  return (
    <section className={css.card} aria-labelledby="sender-card-title">
      <span className={css.cardIcon} aria-hidden="true">
        📦
      </span>
      <div className={css.cardText}>
        <h2 id="sender-card-title" className={css.cardTitle}>
          Dane do wysyłki {complete ? null : <span style={{ color: '#b45309' }}>· do uzupełnienia</span>}
        </h2>
        <p className={css.cardSummary}>{summary}</p>
        {saved ? <p className={css.saved}>Zapisano ✓</p> : null}
      </div>
      <button
        type="button"
        className={css.secondaryBtn}
        onClick={() => {
          setSaved(false);
          setOpen(true);
        }}
      >
        {complete ? 'Zmień' : 'Uzupełnij'}
      </button>
      {open ? (
        <RefumeModal
          id="sender-settings"
          title="Dane nadawcy"
          subtitle="Drukujemy je na etykiecie. Widzisz je tylko Ty i Refume."
          onClose={() => setOpen(false)}
        >
          <SenderDetailsForm
            currentUser={currentUser}
            onSaved={() => {
              setOpen(false);
              setSaved(true);
            }}
          />
        </RefumeModal>
      ) : null}
    </section>
  );
};

export default SenderSettings;
