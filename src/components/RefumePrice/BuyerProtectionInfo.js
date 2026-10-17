import React, { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';

import { BUYER_FEE_PERCENT } from '../../util/refumeFee';

import css from './RefumePrice.module.css';

export const ShieldIcon = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    className={classNames(css.shield, className)}
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M12 2.5l7.5 3v5.7c0 4.6-3.1 8.7-7.5 10.3-4.4-1.6-7.5-5.7-7.5-10.3V5.5z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M8.5 12.2l2.4 2.4 4.6-4.8"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Refume: "z Ochroną Kupującego" trigger with an explanation popover.
 * Opens on hover (desktop) and on click/tap; closes on Escape or click outside.
 */
const BuyerProtectionInfo = () => {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const rootRef = useRef(null);
  const popoverId = 'buyer-protection-info';

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = e => {
      if (e.key === 'Escape') {
        setOpen(false);
        setPinned(false);
      }
    };
    const onClick = e => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setPinned(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <span
      className={css.infoRoot}
      ref={rootRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => !pinned && setOpen(false)}
    >
      <button
        type="button"
        className={css.infoTrigger}
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => {
          setPinned(!pinned || !open);
          setOpen(!(pinned && open));
        }}
      >
        z Ochroną Kupującego
        <ShieldIcon />
      </button>
      {open ? (
        <span id={popoverId} role="note" className={css.popover}>
          <span className={css.popoverTitle}>Za co płacisz?</span>
          <span className={css.popoverText}>
            Opłata za Ochronę Kupującego ({BUYER_FEE_PERCENT}% ceny produktu) obejmuje:
          </span>
          <span className={css.popoverList}>
            <span>• Bezpieczną płatność: pieniądze trafiają do sprzedającego dopiero, gdy potwierdzisz odbiór.</span>
            <span>• Zwrot pieniędzy, jeśli paczka nie dotrze albo produkt nie zgadza się z opisem.</span>
            <span>• Ochronę przed oszustwami i pomoc zespołu Refume w razie problemu.</span>
          </span>
          <span className={css.popoverNote}>
            Sprzedający dostaje pełną kwotę z ogłoszenia. Koszt dostawy zobaczysz przy
            zamówieniu.
          </span>
        </span>
      ) : null}
    </span>
  );
};

export default BuyerProtectionInfo;
