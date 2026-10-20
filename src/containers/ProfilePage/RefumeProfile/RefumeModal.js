import React, { useEffect, useRef } from 'react';

import css from './RefumeModal.module.css';

/**
 * Refume: simple dialog — a sheet from the bottom on phones, a centred window on desktop.
 * Closes with Escape, the × button or a click on the dark background.
 */
const RefumeModal = ({ id, title, subtitle, onClose, footer, children }) => {
  const dialogRef = useRef(null);

  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className={css.overlay} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div
        className={css.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className={css.head}>
          <div>
            <h2 id={`${id}-title`} className={css.title}>
              {title}
            </h2>
            {subtitle ? <p className={css.subtitle}>{subtitle}</p> : null}
          </div>
          <button type="button" className={css.close} onClick={onClose} aria-label="Zamknij">
            ×
          </button>
        </div>
        <div className={css.body}>{children}</div>
        {footer ? <div className={css.footer}>{footer}</div> : null}
      </div>
    </div>
  );
};

export default RefumeModal;
