import React, { useEffect, useRef } from 'react';
import classNames from 'classnames';

import { FormattedMessage } from '../../../util/reactIntl';
import { createSlug } from '../../../util/urlHelpers';
import { AvatarMedium, NamedLink } from '../../../components';
import ReportButton from '../../../components/ReportButton/ReportButton';

import DeliveryInfoMaybe from './DeliveryInfoMaybe';
import RefumeBundleInfo from './RefumeBundleInfo';
import DiminishedActionButtonMaybe from './DiminishedActionButtonMaybe';

import css from './RefumeChatLayout.module.css';

// Status chip and a short hint, by process state and role
const STATUS = {
  inquiry: { label: 'Rozmowa', tone: 'muted' },
  'pending-payment': { label: 'Czeka na płatność', tone: 'info' },
  'payment-expired': { label: 'Płatność wygasła', tone: 'muted' },
  purchased: {
    label: 'Opłacone – czeka na wysyłkę',
    providerLabel: 'Do wysłania',
    tone: 'todo',
    providerHint: 'Nadaj paczkę i oznacz zamówienie jako wysłane.',
    customerHint: 'Sprzedawca przygotowuje paczkę.',
  },
  delivered: {
    label: 'Wysłane',
    tone: 'info',
    providerHint: 'Czekamy, aż kupujący potwierdzi odbiór.',
    customerHint: 'Gdy paczka dotrze, potwierdź odbiór albo zgłoś problem.',
  },
  received: { label: 'Odebrane', tone: 'done' },
  disputed: {
    label: 'Zgłoszony problem',
    tone: 'problem',
    providerHint: 'Zespół Refume sprawdza zgłoszenie i odezwie się w tej rozmowie. Pieniądze są wstrzymane do decyzji.',
    customerHint: 'Zespół Refume sprawdza zgłoszenie i odezwie się w tej rozmowie. Opisz problem i dodaj zdjęcia.',
  },
  canceled: { label: 'Anulowane', tone: 'muted' },
  completed: { label: 'Zakończone', tone: 'done' },
  reviewed: { label: 'Zakończone', tone: 'done' },
  'reviewed-by-customer': { label: 'Zakończone – czeka na opinię', tone: 'done' },
  'reviewed-by-provider': { label: 'Zakończone – czeka na opinię', tone: 'done' },
};

const PROGRESS_STEPS = ['Opłacone', 'Wysłane', 'Odebrane', 'Zakończone'];
const PROGRESS_INDEX = {
  purchased: 0,
  delivered: 1,
  disputed: 1,
  received: 2,
  completed: 3,
  reviewed: 3,
  'reviewed-by-customer': 3,
  'reviewed-by-provider': 3,
};

const IMAGE_VARIANTS = ['listing-card', 'listing-card-2x', 'square-small2x', 'scaled-small', 'default'];
const imageUrl = image => {
  const variants = image?.attributes?.variants || {};
  const name = IMAGE_VARIANTS.find(v => variants[v]?.url) || Object.keys(variants)[0];
  return name ? variants[name].url : null;
};

const formatPrice = price =>
  price?.amount != null
    ? `${(price.amount / 100).toFixed(2).replace('.', ',')} ${price.currency === 'PLN' ? 'zł' : price.currency}`
    : '';

const Progress = ({ processState }) => {
  const index = PROGRESS_INDEX[processState];
  if (index == null) return null;
  return (
    <section className={css.card}>
      <h3 className={css.cardTitle}>Postęp</h3>
      <ol className={css.progress}>
        {PROGRESS_STEPS.map((step, i) => {
          const done = i < index || (i === index && processState !== 'purchased' && processState !== 'delivered' && processState !== 'disputed');
          const current = i === index && !done;
          return (
            <li
              key={step}
              className={classNames(css.step, { [css.stepDone]: done, [css.stepCurrent]: current })}
            >
              <span className={css.stepDot} aria-hidden="true">
                {done ? '✓' : ''}
              </span>
              {step}
              {current && processState === 'disputed' ? ' – zgłoszony problem' : ''}
            </li>
          );
        })}
      </ol>
    </section>
  );
};

/**
 * Refume: conversation layout — header with the other person, the item with its status and
 * the next action, the chat, and order details on the side.
 */
const RefumeChatLayout = props => {
  const {
    className,
    embedded,
    isProvider,
    otherUser,
    otherUserName,
    listing,
    listingTitle,
    listingDeleted,
    firstImage,
    refumeBundle,
    refumeDispute,
    processState,
    isInquiryProcess,
    protectedData,
    config,
    transactionId,
    messagesCount,
    fetchMessagesError,
    activityFeed,
    sendMessageForm,
    actionButtons,
    actionContainer,
    showActionButtons,
    requestQuote,
    offer,
    transactionFieldsComponent,
    fileAttachments,
    refumeOffersPanel,
    orderBreakdown,
    showBreakDown,
    orderPanel,
    showOrderPanel,
    savePaymentMethodFailed,
    showDiminishedButton,
    onOpenDiminishedModal,
    diminishedButtonMessage,
  } = props;

  const feedRef = useRef(null);
  // Show the newest messages (again after images and late styles have settled)
  useEffect(() => {
    const toBottom = () => {
      const el = feedRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    };
    toBottom();
    const raf = typeof window !== 'undefined' ? window.requestAnimationFrame(toBottom) : null;
    const t = setTimeout(toBottom, 400);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [messagesCount]);

  const status = STATUS[processState] || null;
  const statusLabel = status ? (isProvider && status.providerLabel) || status.label : null;
  const hint = status ? (isProvider ? status.providerHint : status.customerHint) : null;
  const image = imageUrl(firstImage);
  const bundleCount = refumeBundle?.items?.length || 0;
  const listingLink = listingDeleted ? null : { id: listing?.id?.uuid, slug: createSlug(listingTitle || 'oferta') };

  return (
    // The page passes a class with display:block — keep it on an outer wrapper so the grid stays a grid
    <div className={className}>
    <div className={classNames(css.root, { [css.embedded]: embedded })}>
      <div className={css.main}>
        <div className={css.chatCard}>
          <div className={css.header}>
            {otherUser ? <AvatarMedium user={otherUser} className={css.avatar} /> : null}
            <div className={css.headerText}>
              <span className={css.name}>{otherUserName || '—'}</span>
              <span className={css.role}>{isProvider ? 'Kupujący' : 'Sprzedający'}</span>
            </div>
            {transactionId ? (
              <div className={css.report}>
                <ReportButton type="rozmowa" targetId={transactionId} />
              </div>
            ) : null}
          </div>

          <div className={css.product}>
            {image ? (
              <img src={image} alt="" className={css.productImage} />
            ) : (
              <span className={css.productImage} aria-hidden="true" />
            )}
            <div className={css.productText}>
              {listingLink ? (
                <NamedLink name="ListingPage" params={listingLink} className={css.productTitle}>
                  {listingTitle}
                </NamedLink>
              ) : (
                <span className={css.productTitle}>{listingTitle}</span>
              )}
              <div className={css.productMeta}>
                <strong>{formatPrice(listing?.attributes?.price)}</strong>
                {bundleCount ? <span className={css.bundle}>Zestaw · {bundleCount + 1} rzeczy</span> : null}
                {statusLabel ? (
                  <span className={classNames(css.chip, css[`tone_${status.tone}`])}>{statusLabel}</span>
                ) : null}
              </div>
              {hint ? <p className={css.hint}>{hint}</p> : null}
            </div>
            {showActionButtons ? <div className={css.productActions}>{actionButtons(actionContainer || 'desktop', css.actionsRoot)}</div> : null}
          </div>

          {/* Everything between the item box and the message box scrolls, so the box stays visible */}
          <div className={css.feed} ref={feedRef}>
            {requestQuote}
            {offer}
            {transactionFieldsComponent}
            {fileAttachments}
            {refumeOffersPanel ? <div className={css.offers}>{refumeOffersPanel}</div> : null}
            {fetchMessagesError ? (
              <p className={css.error}>
                <FormattedMessage id="TransactionPanel.messageLoadingFailed" />
              </p>
            ) : null}
            {activityFeed}
          </div>

          <div className={css.composer}>
            {sendMessageForm || (
              <p className={css.notAllowed}>
                <FormattedMessage id="TransactionPanel.sendingMessageNotAllowed" />
              </p>
            )}
            <p className={css.safety}>
              Płać i kontaktuj się tylko przez Refume – wtedy działa Ochrona Kupującego.
            </p>
          </div>
        </div>
      </div>

      <aside className={css.aside}>
        {savePaymentMethodFailed ? (
          <p className={css.error}>
            <FormattedMessage
              id="TransactionPanel.savePaymentMethodFailed"
              values={{
                paymentMethodsPageLink: (
                  <NamedLink name="PaymentMethodsPage">
                    <FormattedMessage id="TransactionPanel.paymentMethodsPageLink" />
                  </NamedLink>
                ),
              }}
            />
          </p>
        ) : null}

        {showOrderPanel ? <section className={css.card}>{orderPanel}</section> : null}

        {!isInquiryProcess && showBreakDown && orderBreakdown ? (
          <section className={css.card}>
            <h3 className={css.cardTitle}>Szczegóły zamówienia</h3>
            <div className={css.breakdown}>{orderBreakdown}</div>
          </section>
        ) : null}

        <RefumeBundleInfo bundle={refumeBundle} listing={listing} isProvider={isProvider} />

        <DeliveryInfoMaybe
          rootClassName={css.deliveryCard}
          protectedData={protectedData}
          listing={listing}
          locale={config.localization.locale}
        />

        {!isInquiryProcess ? <Progress processState={processState} /> : null}

        <DiminishedActionButtonMaybe
          id="refume_disputeOrderButton"
          showButton={showDiminishedButton}
          onOpenModal={onOpenDiminishedModal}
          buttonMessage={diminishedButtonMessage}
        />
      </aside>
    </div>
    </div>
  );
};

export default RefumeChatLayout;
