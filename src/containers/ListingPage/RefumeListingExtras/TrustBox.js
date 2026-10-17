import React from 'react';

import css from './RefumeListingExtras.module.css';

const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" className={css.trustIcon} aria-hidden="true" focusable="false">
    <path
      d="M12 2.5l7.5 3v5.7c0 4.6-3.1 8.7-7.5 10.3-4.4-1.6-7.5-5.7-7.5-10.3V5.5z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path
      d="M8.5 12.2l2.4 2.4 4.6-4.8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const LockIcon = () => (
  <svg viewBox="0 0 24 24" className={css.trustIcon} aria-hidden="true" focusable="false">
    <rect x="5" y="10.5" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8.5 10.5V7.5a3.5 3.5 0 017 0v3" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

const BoxIcon = () => (
  <svg viewBox="0 0 24 24" className={css.trustIcon} aria-hidden="true" focusable="false">
    <path
      d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z M3.5 7.5L12 12l8.5-4.5 M12 12v9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
);

const ITEMS = [
  {
    icon: <ShieldIcon />,
    title: 'Ochrona kupującego',
    text: 'Pieniądze trafiają do sprzedającego dopiero, gdy potwierdzisz, że paczka dotarła.',
  },
  {
    icon: <BoxIcon />,
    title: 'Gwarancja realizacji',
    text: 'Jeśli paczka nie przyjdzie albo produkt nie zgadza się z opisem, zgłoś problem i odzyskasz pieniądze.',
  },
  {
    icon: <LockIcon />,
    title: 'Bezpieczne płatności',
    text: 'Płacisz w Refume, przez szyfrowane połączenie. Nie przelewaj pieniędzy poza serwisem.',
  },
];

/** Refume: "safe shopping" box in the right column of the listing page. */
const TrustBox = () => (
  <section className={css.trustBox} aria-labelledby="trust-box-title">
    <h2 id="trust-box-title" className={css.sellerHeading}>
      Bezpieczne zakupy
    </h2>
    <ul className={css.trustList}>
      {ITEMS.map(item => (
        <li key={item.title} className={css.trustItem}>
          {item.icon}
          <div>
            <p className={css.trustTitle}>{item.title}</p>
            <p className={css.trustText}>{item.text}</p>
          </div>
        </li>
      ))}
    </ul>
  </section>
);

export default TrustBox;
