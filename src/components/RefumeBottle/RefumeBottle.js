import React from 'react';
import { createPortal } from 'react-dom';
import classNames from 'classnames';

import css from './RefumeBottle.module.css';

// Bottle drawing shared by both animations (viewBox 0 0 120 170)
const Glass = ({ children, clipId }) => (
  <>
    <defs>
      <clipPath id={clipId}>
        <rect x="14" y="52" width="92" height="110" rx="14" />
      </clipPath>
    </defs>
    <rect className={css.neck} x="50" y="34" width="20" height="20" rx="3" />
    <rect className={css.glass} x="14" y="52" width="92" height="110" rx="14" />
    <g clipPath={`url(#${clipId})`}>{children}</g>
    <rect className={css.outline} x="14" y="52" width="92" height="110" rx="14" />
  </>
);

/**
 * Refume: progress of the listing form as a bottle filling up.
 *
 * @param {Array<{ label: string, done: boolean }>} props.steps
 */
export const BottleProgress = ({ steps, className }) => {
  const done = steps.filter(s => s.done).length;
  const ratio = steps.length ? done / steps.length : 0;
  // Liquid top: from the bottom of the glass (y=162) up to its top (y=52)
  const top = 162 - 110 * ratio;
  return (
    <div
      className={classNames(css.progress, className)}
      role="progressbar"
      aria-label="Postęp wystawiania"
      aria-valuemin={0}
      aria-valuemax={steps.length}
      aria-valuenow={done}
      aria-valuetext={`${done} z ${steps.length} kroków`}
    >
      <svg className={css.progressBottle} viewBox="0 0 120 170" aria-hidden="true">
        <rect className={css.cap} x="40" y="10" width="40" height="26" rx="5" />
        <Glass clipId="refume-progress-clip">
          <g className={css.level} style={{ transform: `translateY(${top}px)` }}>
            <path
              className={classNames(css.liquid, ratio > 0 && ratio < 1 ? css.wave : null)}
              d="M0 0 q15 -6 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V120 H0 Z"
            />
          </g>
          <rect className={css.shine} x="24" y="62" width="8" height="70" rx="4" />
        </Glass>
      </svg>
      <div className={css.progressText}>
        <span className={css.progressCount}>
          {done === steps.length ? 'Gotowe do publikacji' : `${done} z ${steps.length} kroków`}
        </span>
        <ul className={css.chips}>
          {steps.map(s => (
            <li key={s.label} className={s.done ? css.chipDone : css.chip}>
              {s.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const MIST = [
  [-34, -14, 4.5, 0],
  [-46, 2, 4, 0.04],
  [-30, 16, 3.2, 0.08],
  [-56, -8, 5, 0.06],
  [-62, 12, 3.2, 0.12],
  [-24, -26, 3.8, 0.1],
  [-70, -18, 2.8, 0.14],
  [-42, -30, 2.6, 0.16],
  [-50, 24, 2.4, 0.18],
];

/** How long the spray takes before the page may move on (ms). */
export const SPRAY_MS = 1500;

/**
 * Refume: "psik" shown full screen when a new listing is being published.
 */
export const PublishSpray = ({ show }) => {
  if (!show || typeof document === 'undefined') return null;
  return createPortal(
    <div className={css.overlay} role="status" aria-live="polite">
      <div className={css.sprayCard}>
        <svg className={css.sprayBottle} viewBox="-70 0 190 170" aria-hidden="true">
          <g className={css.mist}>
            {MIST.map(([x, y, r, d], i) => (
              <circle
                key={i}
                cx="38"
                cy="22"
                r={r}
                style={{ '--x': `${x}px`, '--y': `${y}px`, '--d': `${d}s` }}
              />
            ))}
          </g>
          <g className={css.tilt}>
            <rect className={classNames(css.cap, css.press)} x="40" y="10" width="40" height="26" rx="5" />
            <Glass clipId="refume-spray-clip">
              <rect className={css.liquid} x="0" y="92" width="120" height="80" />
              <rect className={css.shine} x="24" y="62" width="8" height="70" rx="4" />
            </Glass>
          </g>
        </svg>
        <p className={css.sprayText}>
          <span className={css.check} aria-hidden="true">
            <svg viewBox="0 0 14 14">
              <path d="M2.5 7.5l3 3 6-7" />
            </svg>
          </span>
          Publikujemy Twoją ofertę…
        </p>
      </div>
    </div>,
    document.body
  );
};
