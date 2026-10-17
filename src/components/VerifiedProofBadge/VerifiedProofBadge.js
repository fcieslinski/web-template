import React from 'react';
import classNames from 'classnames';

import { isVerifiedByProof } from '../../util/refumeVerification';

import css from './VerifiedProofBadge.module.css';

/**
 * Refume: "Zweryfikowano dowodem zakupu" badge. Renders nothing unless a moderator
 * approved the listing's proof of purchase (listing metadata.weryfikacja).
 *
 * @param {Object} props
 * @param {Object} props.metadata listing.attributes.metadata
 * @param {boolean?} props.compact smaller variant for listing cards
 * @param {string?} props.className
 */
const VerifiedProofBadge = props => {
  const { metadata, compact = false, className } = props;
  if (!isVerifiedByProof(metadata)) {
    return null;
  }
  return (
    <span
      className={classNames(css.root, { [css.compact]: compact }, className)}
      title="Moderator Refume sprawdził dowód zakupu tego produktu."
    >
      <svg className={css.icon} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path
          d="M8 1l1.8 1.3 2.2-.1.7 2.1 1.8 1.3-.7 2.1.7 2.1-1.8 1.3-.7 2.1-2.2-.1L8 15l-1.8-1.3-2.2.1-.7-2.1L1.5 10.4l.7-2.1-.7-2.1 1.8-1.3.7-2.1 2.2.1z"
          fill="currentColor"
        />
        <path
          d="M5.2 8.2l1.9 1.9 3.7-3.9"
          fill="none"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {compact ? 'Zweryfikowano' : 'Zweryfikowano dowodem zakupu'}
    </span>
  );
};

export default VerifiedProofBadge;
