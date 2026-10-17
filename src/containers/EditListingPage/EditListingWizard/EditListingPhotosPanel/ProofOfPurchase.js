import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import classNames from 'classnames';

import { getProofStatus, PROOF_STATUS } from '../../../../util/refumeVerification';
import { uploadProofOfPurchase } from '../../../../ducks/refumeProof.duck';
import { H4 } from '../../../../components';

import css from './ProofOfPurchase.module.css';

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp';
const MAX_SIZE_BYTES = 20 * 1000 * 1000; // Sharetribe image upload limit

const StatusMessage = ({ status, reason }) => {
  switch (status) {
    case PROOF_STATUS.PENDING:
      return (
        <p className={classNames(css.status, css.statusPending)}>
          Dowód wysłany. Czeka na sprawdzenie przez moderatora.
        </p>
      );
    case PROOF_STATUS.VERIFIED:
      return (
        <p className={classNames(css.status, css.statusVerified)}>
          Zweryfikowano. Ogłoszenie ma znacznik „Zweryfikowano dowodem zakupu”.
        </p>
      );
    case PROOF_STATUS.REJECTED:
      return (
        <div className={classNames(css.status, css.statusRejected)} role="alert">
          <p className={css.statusTitle}>Moderator nie zatwierdził dowodu zakupu.</p>
          {reason ? <p className={css.reason}>Powód: {reason}</p> : null}
          <p>Możesz wysłać nowe zdjęcie poniżej.</p>
        </div>
      );
    default:
      return null;
  }
};

/**
 * Refume: optional proof-of-purchase upload on the listing photos step.
 * Only the seller and moderators see the photo. When a moderator approves it,
 * the listing gets the "Zweryfikowano dowodem zakupu" badge.
 *
 * @param {Object} props
 * @param {Object} props.listing own listing entity
 */
const ProofOfPurchase = props => {
  const { listing, hideHeading = false } = props;
  const dispatch = useDispatch();
  const [uploadedProof, setUploadedProof] = useState(null);
  const [inProgress, setInProgress] = useState(false);
  const [error, setError] = useState(null);

  const listingId = listing?.id;
  if (!listingId) {
    return null;
  }

  const { privateData, metadata } = listing.attributes || {};
  // After a fresh upload, show it as waiting for review until the listing is reloaded
  const effectivePrivateData = uploadedProof
    ? { ...privateData, dowodZakupu: uploadedProof }
    : privateData;
  const { status, reason } = getProofStatus(effectivePrivateData, metadata);
  const canUpload = status === PROOF_STATUS.NONE || status === PROOF_STATUS.REJECTED;

  const handleFileChange = e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) {
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError('Plik jest za duży (maks. 20 MB).');
      return;
    }
    setError(null);
    setInProgress(true);
    dispatch(uploadProofOfPurchase({ listingId, file }))
      .then(proof => {
        setUploadedProof(proof);
        setInProgress(false);
      })
      .catch(() => {
        setError('Nie udało się wysłać zdjęcia. Spróbuj ponownie.');
        setInProgress(false);
      });
  };

  const inputId = `proof-of-purchase-${listingId.uuid}`;

  return (
    <section
      className={hideHeading ? css.embedded : css.root}
      aria-labelledby={hideHeading ? undefined : `${inputId}-title`}
    >
      {hideHeading ? null : (
        <>
          <H4 as="h2" id={`${inputId}-title`} className={css.title}>
            Dowód zakupu (opcjonalnie)
          </H4>
          <p className={css.description}>
            Dodaj zdjęcie paragonu lub faktury. Zobaczy je tylko moderator, nie kupujący. Po
            zatwierdzeniu ogłoszenie dostanie znacznik „Zweryfikowano dowodem zakupu”.
          </p>
        </>
      )}

      <StatusMessage status={status} reason={reason} />

      {canUpload ? (
        <div className={css.uploadRow}>
          <label htmlFor={inputId} className={css.uploadButton} aria-disabled={inProgress}>
            {inProgress
              ? 'Wysyłanie…'
              : status === PROOF_STATUS.REJECTED
              ? 'Wyślij nowe zdjęcie'
              : 'Dodaj zdjęcie dowodu zakupu'}
          </label>
          <input
            id={inputId}
            type="file"
            accept={ACCEPTED_TYPES}
            className={css.fileInput}
            onChange={handleFileChange}
            disabled={inProgress}
          />
        </div>
      ) : null}

      {error ? (
        <p className={css.error} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
};

export default ProofOfPurchase;
