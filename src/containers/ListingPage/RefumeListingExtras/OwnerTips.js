import React, { useEffect, useState } from 'react';

import { NamedLink } from '../../../components';
import { createSlug } from '../../../util/urlHelpers';
import { getProofStatus, PROOF_STATUS } from '../../../util/refumeVerification';

import css from './RefumeListingExtras.module.css';

const MIN_PHOTOS = 3;
const MIN_DESCRIPTION = 80;

const photosWord = n => {
  if (n === 1) return 'zdjęcie';
  const last = n % 10;
  const lastTwo = n % 100;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? 'zdjęcia' : 'zdjęć';
};

const CheckIcon = () => (
  <svg viewBox="0 0 20 20" className={css.tipIcon} aria-hidden="true" focusable="false">
    <circle cx="10" cy="10" r="9" fill="currentColor" />
    <path
      d="M6 10.4l2.6 2.5L14 7.6"
      fill="none"
      stroke="#fff"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const TodoIcon = () => (
  <svg viewBox="0 0 20 20" className={css.tipIcon} aria-hidden="true" focusable="false">
    <circle cx="10" cy="10" r="8.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

const ProofExplainer = () => (
  <div className={css.tipExplainer}>
    <ol className={css.tipSteps}>
      <li>
        Dodaj zdjęcie paragonu, faktury albo potwierdzenia zamówienia ze sklepu. Dane osobowe
        możesz zasłonić, ważne, żeby było widać sklep, nazwę perfum i datę.
      </li>
      <li>Moderator Refume sprawdza dowód, zwykle w ciągu 24 godzin.</li>
      <li>
        Po zatwierdzeniu oferta dostaje odznakę „Zweryfikowano dowodem zakupu”, widoczną w
        wynikach wyszukiwania i na stronie oferty.
      </li>
    </ol>
    <p className={css.tipExplainerNote}>
      Sam dowód widzi tylko moderator, kupujący widzą wyłącznie odznakę. Zweryfikowane oferty
      budzą więcej zaufania i kupujący rzadziej dopytują o oryginalność.
    </p>
  </div>
);

/**
 * Refume: checklist for the seller on their own listing — what to improve to get more
 * views and buyers (proof of purchase, photos, description, notes).
 */
const OwnerTips = props => {
  const { listing } = props;
  const [mounted, setMounted] = useState(false);
  const [showProofInfo, setShowProofInfo] = useState(false);
  useEffect(() => setMounted(true), []);

  const id = listing?.id?.uuid;
  const { title = '', description = '', publicData = {}, privateData, metadata, state } =
    listing?.attributes || {};
  if (!mounted || !id || state === 'closed') {
    return null;
  }

  const editParams = { id, slug: createSlug(title), type: 'edit', tab: 'details' };
  const proof = getProofStatus(privateData, metadata);
  const photos = (listing.images || []).length;
  const nuty = publicData.nuty || {};
  const noteCount = ['glowy', 'serca', 'bazy'].reduce(
    (n, k) => n + (Array.isArray(nuty[k]) ? nuty[k].length : 0),
    0
  );
  const descriptionLength = String(description || '').trim().length;

  const tips = [
    {
      key: 'proof',
      done: proof.status === PROOF_STATUS.VERIFIED,
      pending: proof.status === PROOF_STATUS.PENDING,
      title:
        proof.status === PROOF_STATUS.VERIFIED
          ? 'Oferta zweryfikowana dowodem zakupu'
          : proof.status === PROOF_STATUS.PENDING
          ? 'Dowód zakupu czeka na sprawdzenie'
          : proof.status === PROOF_STATUS.REJECTED
          ? 'Dowód zakupu odrzucony, dodaj nowy'
          : 'Dodaj dowód zakupu',
      text:
        proof.status === PROOF_STATUS.PENDING
          ? 'Moderator sprawdzi go zwykle w ciągu 24 godzin. Dostaniesz wiadomość w skrzynce.'
          : proof.status === PROOF_STATUS.REJECTED
          ? `Powód: ${proof.reason || 'zdjęcie było nieczytelne'}.`
          : 'Odznaka „Zweryfikowano dowodem zakupu” to najmocniejszy sygnał, że perfumy są oryginalne.',
      action:
        proof.status === PROOF_STATUS.NONE || proof.status === PROOF_STATUS.REJECTED
          ? { label: 'Dodaj dowód', hash: '#dowod-zakupu' }
          : null,
      explainer: proof.status === PROOF_STATUS.NONE || proof.status === PROOF_STATUS.REJECTED,
    },
    {
      key: 'photos',
      done: photos >= MIN_PHOTOS,
      title:
        photos >= MIN_PHOTOS
          ? `Masz ${photos} ${photosWord(photos)}`
          : `Dodaj więcej zdjęć (masz ${photos})`,
      text:
        'Najlepiej działają co najmniej 3: flakon z przodu, z tyłu (kod batch) i poziom płynu pod światło. Pudełko to plus.',
      action: photos >= MIN_PHOTOS ? null : { label: 'Dodaj zdjęcia' },
    },
    {
      key: 'description',
      done: descriptionLength >= MIN_DESCRIPTION,
      title: descriptionLength >= MIN_DESCRIPTION ? 'Opis gotowy' : 'Napisz kilka zdań opisu',
      text:
        'Gdzie kupione, jak przechowywane, ile razy używane, dlaczego sprzedajesz. Konkretny opis zmniejsza liczbę pytań.',
      action: descriptionLength >= MIN_DESCRIPTION ? null : { label: 'Uzupełnij opis' },
    },
    {
      key: 'notes',
      done: noteCount >= 3,
      title: noteCount >= 3 ? 'Nuty zapachowe uzupełnione' : 'Uzupełnij nuty zapachowe',
      text:
        'Dzięki nutom ofertę łatwiej znaleźć, a pod opisem pojawia się podsumowanie „O tym zapachu”.',
      action: noteCount >= 3 ? null : { label: 'Dodaj nuty' },
    },
  ];

  const doneCount = tips.filter(t => t.done).length;
  if (doneCount === tips.length) {
    return null;
  }
  const percent = Math.round((doneCount / tips.length) * 100);

  return (
    <section className={css.tips} aria-labelledby="owner-tips-title">
      <div className={css.tipsHeader}>
        <h2 id="owner-tips-title" className={css.tipsTitle}>
          Zwiększ zainteresowanie ofertą
        </h2>
        <span className={css.tipsCount}>
          {doneCount} z {tips.length} gotowe
        </span>
      </div>
      <div
        className={css.tipsProgress}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Postęp"
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <ul className={css.tipList}>
        {tips.map(tip => (
          <li
            key={tip.key}
            className={
              tip.done ? `${css.tip} ${css.tipDone}` : tip.pending ? `${css.tip} ${css.tipPending}` : css.tip
            }
          >
            {tip.done ? <CheckIcon /> : <TodoIcon />}
            <div className={css.tipBody}>
              <p className={css.tipTitle}>{tip.title}</p>
              {!tip.done ? <p className={css.tipText}>{tip.text}</p> : null}
              {!tip.done && (tip.action || tip.explainer) ? (
                <div className={css.tipActions}>
                  {tip.action ? (
                    <NamedLink
                      name="EditListingPage"
                      params={editParams}
                      to={tip.action.hash ? { hash: tip.action.hash } : undefined}
                      className={css.tipLink}
                    >
                      {tip.action.label}
                    </NamedLink>
                  ) : null}
                  {tip.explainer ? (
                    <button
                      type="button"
                      className={css.tipMore}
                      aria-expanded={showProofInfo}
                      onClick={() => setShowProofInfo(v => !v)}
                    >
                      {showProofInfo ? 'Zwiń' : 'Jak to działa?'}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {tip.explainer && showProofInfo ? <ProofExplainer /> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default OwnerTips;
