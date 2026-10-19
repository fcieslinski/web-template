/**
 * Refume: favourite listings ("Ulubione"), stored in the current user's privateData
 * (only the user can read it). No reducer: the current user entity is updated in place.
 */
import { useDispatch, useSelector } from 'react-redux';
import { setCurrentUser } from './user.duck';
import { syncListingLike } from '../util/api';

export const FAVORITES_KEY = 'refumeUlubione';
const MAX_FAVORITES = 500;

export const getFavoriteIds = currentUser => {
  const ids = currentUser?.attributes?.profile?.privateData?.[FAVORITES_KEY];
  return Array.isArray(ids) ? ids : [];
};

const withFavorites = (currentUser, ids) => ({
  ...currentUser,
  attributes: {
    ...currentUser.attributes,
    profile: {
      ...currentUser.attributes.profile,
      privateData: { ...(currentUser.attributes.profile?.privateData || {}), [FAVORITES_KEY]: ids },
    },
  },
});

/**
 * Adds or removes a listing (uuid string) from favourites. Optimistic; rolls back on error.
 * @returns {Promise<boolean>} whether the listing is a favourite afterwards
 */
export const toggleFavorite = listingUuid => (dispatch, getState, sdk) => {
  const currentUser = getState().user?.currentUser;
  if (!currentUser?.id) {
    return Promise.reject(new Error('Not logged in'));
  }
  const before = getFavoriteIds(currentUser);
  const isFavorite = before.includes(listingUuid);
  const after = isFavorite
    ? before.filter(id => id !== listingUuid)
    : [listingUuid, ...before].slice(0, MAX_FAVORITES);

  dispatch(setCurrentUser(withFavorites(currentUser, after)));
  return sdk.currentUser
    .updateProfile({ privateData: { [FAVORITES_KEY]: after } })
    .then(() => {
      // Listing like counter (server checks the saved favourites)
      syncListingLike({ listingId: listingUuid }).catch(() => null);
      return !isFavorite;
    })
    .catch(e => {
      const latest = getState().user?.currentUser;
      if (latest?.id) {
        dispatch(setCurrentUser(withFavorites(latest, before)));
      }
      throw e;
    });
};

/** Hook: { isLoggedIn, isFavorite(uuid), toggle(uuid) } */
export const useFavorites = () => {
  const dispatch = useDispatch();
  const currentUser = useSelector(state => state.user?.currentUser);
  const ids = getFavoriteIds(currentUser);
  return {
    isLoggedIn: !!currentUser?.id,
    ids,
    isFavorite: uuid => ids.includes(uuid),
    toggle: uuid => dispatch(toggleFavorite(uuid)),
  };
};
