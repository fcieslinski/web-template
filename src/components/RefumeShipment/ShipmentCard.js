import React, { useCallback, useEffect, useState } from 'react';
import classNames from 'classnames';
import { useSelector } from 'react-redux';

import { fetchShipment, retryShipment, simulateShipment, shipmentLabelUrl } from '../../util/api';
import SenderDetailsForm from './SenderDetailsForm';
import { SHIPMENT_STATUS, CARRIER_NAMES, shipmentSteps } from './shipmentStatus';

import css from './RefumeShipment.module.css';

const SIMULATIONS = [
  ['collected', 'Nadanie'],
  ['delivery', 'W doręczeniu'],
  ['delivered', 'Doręczenie'],
  ['delivery-problem', 'Problem'],
];

const timeOf = iso => {
  try {
    return new Date(iso).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '';
  }
};

/**
 * Refume: shipment of a paid order (Furgonetka): label for the seller, tracking for both.
 * Shown in the side column of the chat.
 */
const ShipmentCard = ({ txId, isProvider, rootClassName }) => {
  const currentUser = useSelector(state => state.user?.currentUser);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(
    () =>
      fetchShipment(txId)
        .then(res => setData(res?.data || null))
        .catch(() => setData(null)),
    [txId]
  );

  useEffect(() => {
    load();
    // The label is made a few seconds after payment; check again for a while
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  if (!data?.enabled || !data.status || data.status === 'pomijana') return null;

  const info = SHIPMENT_STATUS[data.status] || SHIPMENT_STATUS.nowa;
  const carrier = CARRIER_NAMES[data.carrier] || 'Przesyłka';
  const steps = shipmentSteps(data.status);

  const retry = () => {
    setBusy(true);
    setError(null);
    retryShipment({ txId })
      .then(load)
      .catch(() => setError('Nie udało się. Spróbuj za chwilę.'))
      .finally(() => setBusy(false));
  };

  const simulate = state => {
    setBusy(true);
    simulateShipment({ txId, state })
      .then(load)
      .catch(() => setError('Symulacja się nie udała.'))
      .finally(() => setBusy(false));
  };

  const copy = () => {
    try {
      navigator.clipboard.writeText(data.waybill);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      // ignore
    }
  };

  return (
    <section className={classNames(rootClassName || css.card)}>
      <div className={css.head}>
        <h3 className={css.title}>Przesyłka</h3>
        <span className={classNames(css.chip, css[`tone_${info.tone}`])}>{info.label}</span>
      </div>

      <p className={css.carrier}>{carrier}</p>

      {data.waybill ? (
        <div className={css.waybill}>
          <span className={css.waybillLabel}>Numer przesyłki</span>
          <button type="button" className={css.waybillNumber} onClick={copy} title="Kopiuj">
            {data.waybill}
            <span className={css.copy}>{copied ? 'skopiowano' : 'kopiuj'}</span>
          </button>
        </div>
      ) : null}

      {steps ? (
        <ol className={css.steps}>
          {steps.map(s => (
            <li key={s.key} className={classNames(css.step, { [css.stepDone]: s.done, [css.stepNow]: s.now })}>
              <span className={css.dot} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ol>
      ) : null}

      {isProvider && data.status === 'etykieta' ? (
        <div className={css.todo}>
          <strong>Co teraz?</strong>
          <span>1. Pobierz i wydrukuj etykietę (A6 – albo na zwykłej kartce i przytnij).</span>
          <span>2. Naklej ją na dobrze zapakowaną paczkę.</span>
          <span>3. Zanieś paczkę do punktu lub automatu {carrier}. Status zmieni się sam.</span>
        </div>
      ) : null}

      {!isProvider && data.status === 'etykieta' ? (
        <p className={css.hint}>Sprzedawca ma już etykietę. Gdy nada paczkę, zobaczysz to tutaj i w rozmowie.</p>
      ) : null}

      {isProvider && data.labelReady && ['etykieta', 'nadana', 'w-drodze'].includes(data.status) ? (
        <a className={css.primary} href={shipmentLabelUrl(txId)} target="_blank" rel="noopener noreferrer">
          Pobierz etykietę (PDF)
        </a>
      ) : null}

      {data.trackingUrl && !['etykieta', 'nowa'].includes(data.status) ? (
        <a className={css.secondary} href={data.trackingUrl} target="_blank" rel="noopener noreferrer">
          Śledź u przewoźnika
        </a>
      ) : null}

      {isProvider && data.status === 'brak-danych-nadawcy' ? (
        <div className={css.senderBox}>
          <p className={css.hint}>
            Podaj dane nadawcy – wygenerujemy etykietę od razu po zapisaniu. Zapiszą się w profilu na kolejne sprzedaże.
          </p>
          <SenderDetailsForm currentUser={currentUser} compact submitLabel="Zapisz i wygeneruj etykietę" onSaved={retry} />
        </div>
      ) : null}

      {isProvider && data.status === 'blad' ? (
        <div className={css.problem}>
          <p>Nie udało się jeszcze utworzyć etykiety. Próbujemy ponownie automatycznie.</p>
          {data.error ? <p className={css.small}>{data.error}</p> : null}
          <button type="button" className={css.secondary} disabled={busy} onClick={retry}>
            Spróbuj teraz
          </button>
        </div>
      ) : null}

      {!isProvider && ['nowa', 'blad', 'brak-danych-nadawcy'].includes(data.status) ? (
        <p className={css.hint}>Sprzedawca przygotowuje wysyłkę.</p>
      ) : null}

      {data.status === 'problem' ? (
        <p className={css.problemText}>
          Przewoźnik zgłosił problem. Sprawdź szczegóły u przewoźnika; jeśli paczka nie dotrze, zgłoś problem z zamówieniem.
        </p>
      ) : null}

      {data.events?.length ? (
        <details className={css.history}>
          <summary>Historia przesyłki</summary>
          <ul>
            {[...data.events].reverse().map((e, i) => (
              <li key={`${e.at}-${i}`}>
                <span className={css.historyTime}>{timeOf(e.at)}</span>
                <span>{(SHIPMENT_STATUS[e.status] || {}).label || e.opis || e.state}</span>
                {e.punkt ? <span className={css.small}>{e.punkt}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {error ? (
        <p className={css.error} role="alert">
          {error}
        </p>
      ) : null}

      {data.sandbox && data.waybill ? (
        <div className={css.sandbox}>
          <span>Test (sandbox Furgonetki): symuluj</span>
          <div className={css.sandboxButtons}>
            {SIMULATIONS.map(([state, label]) => (
              <button key={state} type="button" disabled={busy} onClick={() => simulate(state)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default ShipmentCard;
