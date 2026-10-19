import React, { useEffect, useState } from 'react';

import { fetchAiDescription } from '../../../util/api';
import { aiInputOf, aiInputKey, hasEnoughForAi } from '../../../util/refumeAiInput';

import css from './RefumeListingExtras.module.css';

const SparkleIcon = () => (
  <svg viewBox="0 0 24 24" className={css.aiIcon} aria-hidden="true" focusable="false">
    <path
      d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"
      fill="currentColor"
    />
  </svg>
);

/**
 * Refume: "O tym zapachu" — a short AI description under the seller's description.
 * Uses the saved text when it still matches the listing; otherwise asks the server, which
 * writes it once per perfume. Shows nothing when there are too few notes or no AI key.
 */
const AiPerfumeSummary = props => {
  const { listing } = props;
  const uuid = listing?.id?.uuid;
  const { title, publicData, metadata, state } = listing?.attributes || {};
  const input = aiInputOf(publicData);
  const key = aiInputKey(title, input);
  const saved = metadata?.refumeOpisAI;
  const savedText = saved?.klucz === key ? saved.tekst : null;

  const [fetched, setFetched] = useState(null);
  const [loading, setLoading] = useState(false);

  const canHave = state === 'published' && hasEnoughForAi(input);

  useEffect(() => {
    if (!uuid || !canHave || savedText) return;
    let cancelled = false;
    setLoading(true);
    fetchAiDescription(uuid)
      .then(r => !cancelled && setFetched(r?.data?.tekst || null))
      .catch(() => null)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [uuid, key, canHave, !!savedText]);

  const text = savedText || fetched;
  if (!canHave || (!text && !loading)) {
    return null;
  }

  return (
    <section className={css.aiSection} aria-labelledby="ai-summary-title" aria-busy={!text}>
      <h2 id="ai-summary-title" className={css.aiTitle}>
        <SparkleIcon />O tym zapachu
      </h2>
      {text ? (
        <p className={css.aiText}>{text}</p>
      ) : (
        <div className={css.aiSkeleton} aria-label="Przygotowujemy opis zapachu…">
          <span />
          <span />
          <span />
        </div>
      )}
      <p className={css.aiNote}>
        Opis wygenerowany automatycznie na podstawie nut zapachowych. Może zawierać nieścisłości.
      </p>
    </section>
  );
};

export default AiPerfumeSummary;
