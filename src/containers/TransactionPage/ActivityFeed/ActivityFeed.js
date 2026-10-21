import React, { useEffect } from 'react';
import classNames from 'classnames';

import { FormattedMessage, useIntl } from '../../../util/reactIntl';
import { types as sdkTypes } from '../../../util/sdkLoader';
import { useConfiguration } from '../../../context/configurationContext';
import { formatMoney } from '../../../util/currency';
import { formatDateWithProximity } from '../../../util/dates';
import { propTypes } from '../../../util/types';
import {
  getProcess,
  getUserTxRole,
  TX_TRANSITION_ACTOR_PROVIDER,
  TX_TRANSITION_ACTOR_OPERATOR,
  TX_TRANSITION_ACTOR_SYSTEM,
} from '../../../transactions/transaction';

import { InlineTextButton, ReviewRating, UserDisplayName } from '../../../components';
import { Message, OwnMessage } from '../Message/Message';

import { stateDataShape } from '../TransactionPage.stateData';

import { hasHiddenPhone, detectChatRisks } from '../../../util/refumeChatSafety';
import { checkConversation } from '../../../util/api';
import OfferMessage, { OfferDecision } from '../../../components/RefumePriceOffer/OfferMessage';
import { getOffers } from '../../../util/refumeOffers';
import css from './ActivityFeed.module.css';

const { Money } = sdkTypes;

/**
 * @component
 * @param {Object} props - The props
 * @param {string} props.content - The content
 * @param {number} props.rating - The rating
 * @returns {JSX.Element} The Review component
 */
const Review = props => {
  const { content, rating } = props;
  return (
    <div>
      <p className={css.reviewContent}>{content}</p>
      {rating ? (
        <ReviewRating
          reviewStarClassName={css.reviewStar}
          className={css.reviewStars}
          rating={rating}
        />
      ) : null}
    </div>
  );
};

const TransitionMessage = props => {
  const {
    transition,
    nextState,
    stateData,
    deliveryMethod,
    listingTitle,
    negotiationOffer = '-',
    ownRole,
    otherUsersName,
    onOpenReviewModal,
    intl,
  } = props;
  const { processName, processState, showReviewAsFirstLink, showReviewAsSecondLink } = stateData;
  const stateStatus = nextState === processState ? 'current' : 'past';
  const transitionName = transition.transition;

  // actor: 'you', 'system', 'operator', or display name of the other party
  const actor =
    transition.by === ownRole
      ? 'you'
      : [TX_TRANSITION_ACTOR_SYSTEM, TX_TRANSITION_ACTOR_OPERATOR].includes(transition.by)
      ? transition.by
      : otherUsersName;

  const reviewLink = showReviewAsFirstLink ? (
    <InlineTextButton onClick={onOpenReviewModal} rootClassName={css.reviewLink}>
      <FormattedMessage id="TransactionPage.ActivityFeed.reviewLink" values={{ otherUsersName }} />
    </InlineTextButton>
  ) : showReviewAsSecondLink ? (
    <InlineTextButton onClick={onOpenReviewModal} rootClassName={css.reviewLink}>
      <FormattedMessage
        id="TransactionPage.ActivityFeed.reviewAsSecondLink"
        values={{ otherUsersName }}
      />
    </InlineTextButton>
  ) : null;

  // If there is a transition specific message, use it.
  const messageConfig = stateData.transitionMessages?.find(m => m.transition === transitionName);
  const transitionMessage = messageConfig
    ? intl.formatMessage(
        { id: messageConfig.translationId },
        {
          actor,
          otherUsersName,
          listingTitle,
          reviewLink,
          deliveryMethod,
          stateStatus,
          negotiationOffer,
          transactionRole: ownRole,
        }
      )
    : '';

  // ActivityFeed messages are tied to transaction process and transitions.
  // However, in practice, transitions leading to same state have had the same message.
  const defaultMessage = intl.formatMessage(
    { id: `TransactionPage.ActivityFeed.${processName}.${nextState}` },
    {
      actor,
      otherUsersName,
      listingTitle,
      reviewLink,
      deliveryMethod,
      stateStatus,
      negotiationOffer,
      transactionRole: ownRole,
    }
  );

  return messageConfig ? transitionMessage : defaultMessage;
};

/**
 * @component
 * @param {Object} props - The props
 * @param {string} props.transitionMessageComponent - The transition message component
 * @param {string} props.formattedDate - The formatted date
 * @param {React.Component} props.reviewComponent - The review component
 * @returns {JSX.Element} The Transition component
 */
const Transition = props => {
  const { transitionMessageComponent, formattedDate, reviewComponent } = props;
  return (
    <div className={css.transition}>
      <div className={css.bullet}>
        <p className={css.transitionContent}>•</p>
      </div>
      <div>
        <p className={css.transitionContent}>{transitionMessageComponent}</p>
        <p className={css.transitionDate}>{formattedDate}</p>
        {reviewComponent}
      </div>
    </div>
  );
};

const reviewByAuthorId = (transaction, userId) => {
  return transaction.reviews.filter(
    r => !r.attributes.deleted && r.author.id.uuid === userId.uuid
  )[0];
};

const ReviewComponentMaybe = props => {
  const { showReviews, isRelevantTransition, reviewEntity, intl } = props;
  if (showReviews && isRelevantTransition) {
    const deletedReviewContent = intl.formatMessage({
      id: 'TransactionPage.ActivityFeed.deletedReviewContent',
    });
    const content = reviewEntity?.attributes?.deleted
      ? deletedReviewContent
      : reviewEntity?.attributes?.content;
    const rating = reviewEntity?.attributes?.rating;
    const ratingMaybe = rating ? { rating } : {};
    return <Review content={content} {...ratingMaybe} />;
  }
  return null;
};

const isMessage = item => item && item.type === 'message';

// Refume: ask the server to queue suspicious messages for moderators (once per set of messages)
const reportedKeys = new Set();
const ChatFlagReporter = ({ txId, riskyKey }) => {
  useEffect(() => {
    if (!txId || !riskyKey) return;
    const key = `${txId}|${riskyKey}`;
    if (reportedKeys.has(key)) return;
    reportedKeys.add(key);
    checkConversation({ txId }).catch(() => reportedKeys.delete(key));
  }, [txId, riskyKey]);
  return null;
};

// Compare function for sorting an array containing messages and transitions
const compareItems = (a, b) => {
  const itemDate = item => (isMessage(item) ? item.attributes.createdAt : item.createdAt);
  return itemDate(a) - itemDate(b);
};

const organizedItems = (messages, transitions, hideOldTransitions) => {
  const items = messages.concat(transitions).sort(compareItems);
  if (hideOldTransitions) {
    // Hide transitions that happened before the oldest message. Since
    // we have older items (messages) that we are not showing, seeing
    // old transitions would be confusing.
    const firstMessageIndex = items.findIndex(i => isMessage(i));
    return firstMessageIndex >= 0 ? items.slice(firstMessageIndex) : [];
  } else {
    return items;
  }
};

/**
 * @component
 * @param {Object} props - The props
 * @param {string} [props.rootClassName] - Custom class that extends the default class for the root element
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {Array<propTypes.message>} props.messages - The messages
 * @param {propTypes.transaction} props.transaction - The transaction
 * @param {stateDataShape} props.stateData - The state data
 * @param {propTypes.currentUser} props.currentUser - The current user
 * @param {boolean} props.hasOlderMessages - Whether there are older messages
 * @param {boolean} props.fetchMessagesInProgress - Whether the fetch messages is in progress
 * @param {Function} props.onOpenReviewModal - The on open review modal function
 * @param {Function} props.onShowOlderMessages - The on show older messages function
 * @param {boolean} [props.allowFiles] - Whether file downloads are allowed
 * @param {Function} [props.onDownloadFile] - Download handler for message file attachments
 * @param {Object} [props.fileDownloads] - Map of file attachment uuid to download state
 * @returns {JSX.Element} The ActivityFeed component
 */

// Refume: put team messages (transaction metadata) between chat items by date. When older
// messages are not loaded yet, team messages older than the first shown item are left out.
const itemDate = item =>
  new Date(item?.attributes?.createdAt || item?.createdAt || 0).getTime();
const withTeamMessages = (items, spor, hideOld) => {
  const team = [
    ...(Array.isArray(spor?.wiadomosci) ? spor.wiadomosci : []).map(m => ({
      refumeTeam: true,
      id: m.id,
      at: m.at,
      text: m.tresc,
    })),
    ...(spor?.decyzja
      ? [{ refumeTeam: true, id: 'decyzja', at: spor.decyzja.at, text: spor.decyzja.uzasadnienie, decision: spor.decyzja.wynik }]
      : []),
  ].filter(t => t.at && t.text);
  if (!team.length) return items;
  return mergeByDate(items, team, hideOld);
};

// Refume: price offers from transaction metadata, shown as cards in the chat. The automatic
// chat messages the server writes for offers are hidden, the cards replace them.
const OFFER_MESSAGE_RE = /^(💬 (Propozycja ceny|Kontroferta): |✅ Propozycja .* zaakceptowana|❌ Propozycja .* odrzucona)/;
const isOfferChatMessage = item =>
  isMessage(item) && OFFER_MESSAGE_RE.test(item.attributes?.content || '');
const withOffers = (items, metadata, hideOld) => {
  const offers = getOffers(metadata);
  if (!offers.length) return items;
  const extra = [];
  offers.forEach((offer, i) => {
    if (!offer.createdAt) return;
    extra.push({
      refumeTeam: true,
      offer,
      id: `offer-${i}`,
      at: offer.createdAt,
      isLast: i === offers.length - 1,
      isCounter: i > 0 && offers[i - 1].status === 'countered',
    });
    if ((offer.status === 'accepted' || offer.status === 'rejected') && offer.decidedAt) {
      extra.push({ refumeTeam: true, offerDecision: offer, id: `offer-${i}-d`, at: offer.decidedAt });
    }
  });
  return mergeByDate(items.filter(i => !isOfferChatMessage(i)), extra, hideOld);
};
const mergeByDate = (items, team, hideOld) => {
  if (!team.length) return items;
  const first = items.length ? itemDate(items[0]) : 0;
  const shownTeam = hideOld ? team.filter(t => t.isLast || new Date(t.at).getTime() >= first) : team;
  return [...items, ...shownTeam].sort(
    (a, b) => (a.refumeTeam ? new Date(a.at).getTime() : itemDate(a)) - (b.refumeTeam ? new Date(b.at).getTime() : itemDate(b))
  );
};

export const ActivityFeed = props => {
  const intl = props.intl || useIntl();
  const config = useConfiguration();
  const {
    rootClassName,
    className,
    messages,
    transaction = {},
    stateData = {},
    currentUser,
    hasOlderMessages,
    fetchMessagesInProgress,
    onOpenReviewModal,
    onShowOlderMessages,
    allowFiles,
    onDownloadFile,
    fileDownloads,
    onOffersChanged,
  } = props;
  const classes = classNames(rootClassName || css.root, className);
  const processName = stateData.processName;

  // If stateData doesn't have processName, full tx data has not been fetched.
  if (!processName) {
    return null;
  }
  const process = getProcess(processName);
  const transitions = transaction?.attributes?.transitions || [];
  const offers = transaction?.attributes?.metadata?.offers;

  const enhancedTransitions =
    offers && process.getTransitionsWithMatchingOffers
      ? process.getTransitionsWithMatchingOffers(transitions, offers)
      : transitions;
  // Check currency primarily from tx, secondarily from listing, the fallback is marketplace currency
  const currency =
    transaction?.attributes?.payinTotal?.currency ||
    transaction?.listing?.attributes?.price?.currency ||
    config.currency;
  const relevantTransitions = enhancedTransitions.filter(t =>
    process.isRelevantPastTransition(t.transition)
  );
  const todayString = intl.formatMessage({ id: 'TransactionPage.ActivityFeed.today' });

  // combine messages and transaction transitions
  const hideOldTransitions = hasOlderMessages || fetchMessagesInProgress;
  const items = organizedItems(messages, relevantTransitions, hideOldTransitions);

  // Refume: a phone number split over several messages ("500", "234", "567"). For each
  // message, join it with up to 3 earlier messages in a row from the same person.
  const splitPhoneIds = new Set();
  items.forEach((item, i) => {
    if (!isMessage(item)) return;
    const senderId = item.sender?.id?.uuid;
    const run = [item];
    for (let j = i - 1; j >= 0 && run.length < 4; j--) {
      const prev = items[j];
      if (!isMessage(prev) || prev.sender?.id?.uuid !== senderId) break;
      run.unshift(prev);
    }
    const parts = run.map(m => m.attributes.content || '');
    if (parts.length > 1 && !hasHiddenPhone(parts[parts.length - 1]) && hasHiddenPhone(parts.join(' '))) {
      // Hide every part of the split number
      run.forEach(m => splitPhoneIds.add(m.id.uuid));
    }
  });
  // Messages the moderators should look at (checked again on the server)
  const riskyKey = items
    .filter(
      item =>
        isMessage(item) &&
        (splitPhoneIds.has(item.id.uuid) || detectChatRisks(item.attributes.content).any)
    )
    .map(item => item.id.uuid)
    .join(',');

  const messageListItem = message => {
    const formattedDate = formatDateWithProximity(message.attributes.createdAt, intl, todayString, {
      firstDayOfWeek: config.localization.firstDayOfWeek,
    });
    const isOwnMessage = currentUser?.id && message?.sender?.id?.uuid === currentUser.id?.uuid;
    const messageComponent = isOwnMessage ? (
      <OwnMessage
        message={message}
        refumeSplitPhone={splitPhoneIds.has(message.id.uuid)}
        formattedDate={formattedDate}
        transaction={transaction}
        intl={intl}
        allowFiles={allowFiles}
        downloadFile={onDownloadFile}
        fileDownloads={fileDownloads}
        marketplaceName={config.marketplaceName}
      />
    ) : (
      <Message
        message={message}
        refumeSplitPhone={splitPhoneIds.has(message.id.uuid)}
        formattedDate={formattedDate}
        transaction={transaction}
        intl={intl}
        allowFiles={allowFiles}
        downloadFile={onDownloadFile}
        fileDownloads={fileDownloads}
        marketplaceName={config.marketplaceName}
      />
    );

    return (
      <li id={`msg-${message.id.uuid}`} key={message.id.uuid} className={css.messageItem}>
        {messageComponent}
      </li>
    );
  };

  const transitionListItem = transition => {
    const formattedDate = formatDateWithProximity(transition.createdAt, intl, todayString, {
      firstDayOfWeek: config.localization.firstDayOfWeek,
    });
    const { customer, provider, listing } = transaction || {};

    // Initially transition component is empty;
    let transitionComponent = <Transition />;

    if (currentUser?.id && customer?.id && provider?.id && listing?.id) {
      const transitionName = transition.transition;
      const nextState = process.getStateAfterTransition(transition.transition);
      const isCustomerReview = process.isCustomerReview(transitionName);
      const isProviderRieview = process.isProviderReview(transitionName);
      const reviewEntity = isCustomerReview
        ? reviewByAuthorId(transaction, customer.id)
        : isProviderRieview
        ? reviewByAuthorId(transaction, provider.id)
        : null;

      const listingTitle = listing.attributes.deleted
        ? intl.formatMessage({ id: 'TransactionPage.ActivityFeed.deletedListing' })
        : listing.attributes.title;

      const ownRole = getUserTxRole(currentUser.id, transaction);
      const otherUser = ownRole === TX_TRANSITION_ACTOR_PROVIDER ? customer : provider;

      const offerInSubunits = transition.offerInSubunits;
      const negotiationOffer = offerInSubunits
        ? formatMoney(intl, new Money(offerInSubunits, currency))
        : null;

      transitionComponent = (
        <Transition
          formattedDate={formattedDate}
          transitionMessageComponent={
            <TransitionMessage
              transition={transition}
              nextState={nextState}
              stateData={stateData}
              deliveryMethod={transaction.attributes?.protectedData?.deliveryMethod || 'none'}
              listingTitle={listingTitle}
              negotiationOffer={negotiationOffer}
              ownRole={ownRole}
              otherUsersName={<UserDisplayName user={otherUser} intl={intl} />}
              onOpenReviewModal={onOpenReviewModal}
              intl={intl}
            />
          }
          reviewComponent={
            <ReviewComponentMaybe
              showReviews={stateData.showReviews}
              isRelevantTransition={isCustomerReview || isProviderRieview}
              reviewEntity={reviewEntity}
              intl={intl}
            />
          }
        />
      );
    }
    return (
      <li key={`${transition.transition}-${transition.createdAt}`} className={css.transitionItem}>
        {transitionComponent}
      </li>
    );
  };

  // Refume: messages and decisions from "Zespół Refume" (disputes), in their place in time
  const teamListItem = item => (
    <li key={`team-${item.id}`} className={css.messageItem}>
      <div className={item.decision ? css.teamDecision : css.teamMessage}>
        <span className={css.teamAvatar} aria-hidden="true">
          R
        </span>
        <div className={css.teamBody}>
          <span className={css.teamName}>
            {item.decision
              ? item.decision === 'zwrot'
                ? 'Zespół Refume · decyzja: zwrot pieniędzy dla kupującego'
                : 'Zespół Refume · decyzja: zamówienie zrealizowane'
              : 'Zespół Refume'}
          </span>
          <p className={css.teamText}>{item.text}</p>
          <span className={css.teamDate}>
            {formatDateWithProximity(new Date(item.at), intl, todayString, {
              firstDayOfWeek: config.localization.firstDayOfWeek,
            })}
          </span>
        </div>
      </div>
    </li>
  );

  // Refume: price offer card with Akceptuj / Kontroferta / Odrzuć
  const offerRole = currentUser?.id && transaction?.id && transaction?.customer?.id ? getUserTxRole(currentUser.id, transaction) : null;
  const offerOther = offerRole === TX_TRANSITION_ACTOR_PROVIDER ? transaction?.customer : transaction?.provider;
  const offerListItem = item => (
    <li key={item.id} className={css.messageItem}>
      <OfferMessage
        offer={item.offer}
        isLast={item.isLast}
        active={transaction?.attributes?.lastTransition === 'transition/inquire'}
        isCounter={item.isCounter}
        role={offerRole}
        listingPrice={transaction?.listing?.attributes?.price}
        transactionId={transaction?.id}
        otherName={offerOther?.attributes?.profile?.displayName}
        formattedDate={formatDateWithProximity(new Date(item.at), intl, todayString, {
          firstDayOfWeek: config.localization.firstDayOfWeek,
        })}
        onChanged={onOffersChanged}
      />
    </li>
  );

  return (
    <ul className={classes}>
      {hasOlderMessages ? (
        <li className={css.showOlderWrapper} key="show-older-messages">
          <InlineTextButton className={css.showOlderButton} onClick={onShowOlderMessages}>
            <FormattedMessage id="TransactionPage.ActivityFeed.showOlderMessages" />
          </InlineTextButton>
        </li>
      ) : null}
      <ChatFlagReporter txId={transaction?.id?.uuid} riskyKey={riskyKey} />
      {withTeamMessages(
        withOffers(items, transaction?.attributes?.metadata, hideOldTransitions),
        transaction?.attributes?.metadata?.refumeSpor,
        hideOldTransitions
      ).map(item => {
        if (item.offer) {
          return offerListItem(item);
        } else if (item.offerDecision) {
          return (
            <li key={item.id} className={css.transitionItem}>
              <OfferDecision offer={item.offerDecision} />
            </li>
          );
        } else if (item.refumeTeam) {
          return teamListItem(item);
        } else if (isMessage(item)) {
          return messageListItem(item);
        } else {
          return transitionListItem(item);
        }
      })}
    </ul>
  );
};

export default ActivityFeed;
