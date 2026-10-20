import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useParams } from 'react-router-dom';
import classNames from 'classnames';

import { denormalisedResponseEntities } from '../../util/data';
import { Page, LayoutSingleColumn, NamedLink, AvatarSmall } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import css from './OrdersPage.module.css';

const PER_PAGE = 20;

// Purchase process: everything after payment (inquiries, unpaid and expired checkouts are hidden)
const STATUS = {
  'transition/confirm-payment': { label: 'Opłacone – czeka na wysyłkę', tone: 'todo', sellerLabel: 'Do wysłania' },
  'transition/mark-delivered': { label: 'Wysłane', tone: 'info', sellerLabel: 'Wysłane – czeka na odbiór' },
  'transition/operator-mark-delivered': { label: 'Dostarczone', tone: 'info' },
  'transition/mark-received-from-purchased': { label: 'Odebrane', tone: 'done' },
  'transition/mark-received': { label: 'Odebrane', tone: 'done' },
  'transition/auto-mark-received': { label: 'Odebrane', tone: 'done' },
  'transition/mark-received-from-disputed': { label: 'Odebrane po zgłoszeniu problemu', tone: 'done' },
  'transition/dispute': { label: 'Zgłoszony problem', tone: 'problem' },
  'transition/operator-dispute': { label: 'Zgłoszony problem', tone: 'problem' },
  'transition/cancel': { label: 'Anulowane', tone: 'muted' },
  'transition/auto-cancel': { label: 'Anulowane – nie wysłano na czas', tone: 'muted' },
  'transition/cancel-from-disputed': { label: 'Anulowane po zgłoszeniu problemu', tone: 'muted' },
  'transition/auto-cancel-from-disputed': { label: 'Anulowane po zgłoszeniu problemu', tone: 'muted' },
  'transition/auto-complete': { label: 'Zakończone', tone: 'done' },
  'transition/review-1-by-provider': { label: 'Zakończone – czeka na opinię', tone: 'done' },
  'transition/review-1-by-customer': { label: 'Zakończone – czeka na opinię', tone: 'done' },
  'transition/review-2-by-provider': { label: 'Zakończone', tone: 'done' },
  'transition/review-2-by-customer': { label: 'Zakończone', tone: 'done' },
  'transition/expire-customer-review-period': { label: 'Zakończone', tone: 'done' },
  'transition/expire-provider-review-period': { label: 'Zakończone', tone: 'done' },
  'transition/expire-review-period': { label: 'Zakończone', tone: 'done' },
};
const LAST_TRANSITIONS = Object.keys(STATUS);

const TABS = [
  { key: 'kupione', label: 'Kupione', only: 'order' },
  { key: 'sprzedane', label: 'Sprzedane', only: 'sale' },
];

const formatMoney = money =>
  money?.amount != null
    ? `${(money.amount / 100).toFixed(2).replace('.', ',')} ${money.currency === 'PLN' ? 'zł' : money.currency}`
    : '';

const formatDate = date => {
  try {
    return new Date(date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (e) {
    return '';
  }
};

const IMAGE_VARIANTS = ['listing-card', 'listing-card-2x', 'square-small2x', 'square-small'];
const imageOf = listing => {
  const variants = listing?.images?.[0]?.attributes?.variants || {};
  const name = IMAGE_VARIANTS.find(v => variants[v]?.url);
  return name ? variants[name].url : null;
};

const queryTransactions = (only, page) => (dispatch, getState, sdk) =>
  sdk.transactions
    .query({
      only,
      lastTransitions: LAST_TRANSITIONS,
      include: ['listing', 'listing.images', 'provider', 'provider.profileImage', 'customer', 'customer.profileImage'],
      'fields.transaction': ['lastTransition', 'lastTransitionedAt', 'createdAt', 'payinTotal', 'payoutTotal', 'metadata', 'protectedData'],
      'fields.listing': ['title'],
      'fields.user': ['profile.displayName', 'profile.abbreviatedName', 'deleted', 'banned'],
      'fields.image': ['variants.listing-card', 'variants.listing-card-2x', 'variants.square-small', 'variants.square-small2x'],
      'limit.images': 1,
      sort: 'lastTransitionedAt',
      page,
      perPage: PER_PAGE,
    })
    .then(response => ({
      transactions: denormalisedResponseEntities(response),
      totalPages: response.data.meta?.totalPages || 1,
    }));

const OrderRow = ({ tx, isSale }) => {
  const status = STATUS[tx.attributes.lastTransition] || { label: 'W toku', tone: 'info' };
  const label = isSale && status.sellerLabel ? status.sellerLabel : status.label;
  const other = isSale ? tx.customer : tx.provider;
  const bundleCount = tx.attributes.metadata?.refumePakiet?.items?.length || 0;
  const total = isSale ? tx.attributes.payoutTotal : tx.attributes.payinTotal;
  const image = imageOf(tx.listing);
  const carrier = tx.attributes.protectedData?.shippingCarrier;
  return (
    <li>
      <NamedLink
        name={isSale ? 'SaleDetailsPage' : 'OrderDetailsPage'}
        params={{ id: tx.id.uuid }}
        className={classNames(css.row, { [css.rowTodo]: status.tone === 'todo' && isSale })}
      >
        {image ? (
          <img src={image} alt="" className={css.thumb} loading="lazy" />
        ) : (
          <span className={css.thumb} aria-hidden="true" />
        )}
        <span className={css.main}>
          <span className={css.title}>
            {tx.listing?.attributes?.title || 'Oferta usunięta'}
            {bundleCount ? <span className={css.bundle}>Zestaw · {bundleCount + 1} rzeczy</span> : null}
          </span>
          <span className={css.meta}>
            {other ? <AvatarSmall user={other} className={css.avatar} disableProfileLink /> : null}
            <span>
              {isSale ? 'Kupujący' : 'Sprzedawca'}: {other?.attributes?.profile?.displayName || '—'}
            </span>
            <span aria-hidden="true">·</span>
            <span>{formatDate(tx.attributes.createdAt)}</span>
            {carrier === 'pickup' || tx.attributes.protectedData?.deliveryMethod === 'pickup' ? (
              <>
                <span aria-hidden="true">·</span>
                <span>odbiór osobisty</span>
              </>
            ) : null}
          </span>
        </span>
        <span className={css.side}>
          <span className={css.total}>{formatMoney(total)}</span>
          <span className={classNames(css.status, css[`tone_${status.tone}`])}>{label}</span>
        </span>
      </NamedLink>
    </li>
  );
};

/**
 * Refume: "Zamówienia" — what I bought and what others bought from me
 * (route /zamowienia/:tab, tab = kupione | sprzedane).
 */
const OrdersPage = () => {
  const { tab: tabParam } = useParams();
  const tab = TABS.find(t => t.key === tabParam) || TABS[0];
  const isSale = tab.key === 'sprzedane';
  const dispatch = useDispatch();
  const [state, setState] = useState({ list: [], page: 0, totalPages: 1, loading: true, error: false });

  const load = (page, append) => {
    setState(s => ({ ...s, loading: true, error: false }));
    dispatch(queryTransactions(tab.only, page))
      .then(({ transactions, totalPages }) =>
        setState(s => ({
          list: append ? [...s.list, ...transactions] : transactions,
          page,
          totalPages,
          loading: false,
          error: false,
        }))
      )
      .catch(() => setState(s => ({ ...s, loading: false, error: true })));
  };

  useEffect(() => {
    setState({ list: [], page: 0, totalPages: 1, loading: true, error: false });
    load(1, false);
  }, [tab.key]);

  const toShip = isSale
    ? state.list.filter(tx => tx.attributes.lastTransition === 'transition/confirm-payment').length
    : 0;

  return (
    <Page title={isSale ? 'Sprzedane' : 'Moje zamówienia'} scrollingDisabled={false}>
      <LayoutSingleColumn topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div className={css.root}>
          <h1 className={css.heading}>Zamówienia</h1>
          <nav className={css.tabs} aria-label="Rodzaj zamówień">
            {TABS.map(t => (
              <NamedLink
                key={t.key}
                name="OrdersPage"
                params={{ tab: t.key }}
                className={classNames(css.tab, { [css.tabActive]: t.key === tab.key })}
                aria-current={t.key === tab.key ? 'page' : undefined}
              >
                {t.label}
              </NamedLink>
            ))}
          </nav>

          {isSale && toShip ? (
            <p className={css.notice}>
              Masz {toShip} {toShip === 1 ? 'zamówienie' : toShip < 5 ? 'zamówienia' : 'zamówień'} do
              wysłania. Nadaj paczkę i oznacz ją jako wysłaną w zamówieniu.
            </p>
          ) : null}

          {state.error ? (
            <p className={css.error}>Nie udało się wczytać zamówień. Odśwież stronę.</p>
          ) : !state.list.length && state.loading ? (
            <p className={css.muted}>Ładowanie…</p>
          ) : !state.list.length ? (
            <div className={css.empty}>
              <p>{isSale ? 'Nikt jeszcze nic od Ciebie nie kupił.' : 'Nie masz jeszcze zamówień.'}</p>
              <NamedLink name={isSale ? 'NewListingPage' : 'SearchPage'} className={css.emptyCta}>
                {isSale ? 'Wystaw perfumy' : 'Przeglądaj perfumy'}
              </NamedLink>
            </div>
          ) : (
            <>
              <ul className={css.list}>
                {state.list.map(tx => (
                  <OrderRow key={tx.id.uuid} tx={tx} isSale={isSale} />
                ))}
              </ul>
              {state.page < state.totalPages ? (
                <button
                  type="button"
                  className={css.more}
                  disabled={state.loading}
                  onClick={() => load(state.page + 1, true)}
                >
                  {state.loading ? 'Ładowanie…' : 'Pokaż więcej'}
                </button>
              ) : null}
            </>
          )}
          <p className={css.footnote}>
            Rozmowy bez zakupu znajdziesz w{' '}
            <NamedLink name="InboxPage" params={{ tab: isSale ? 'sales' : 'orders' }}>
              wiadomościach
            </NamedLink>
            .
          </p>
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

export default OrdersPage;
