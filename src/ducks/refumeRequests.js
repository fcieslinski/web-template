/**
 * Refume: perfumes the current user is waiting for ("Powiadom mnie"), stored in their own
 * profile privateData.refumePoszukiwane. The server groups everyone's lists into the public
 * "Poszukiwane" page and emails watchers when a matching listing is published.
 */
import { useDispatch, useSelector } from 'react-redux';
import { setCurrentUser } from './user.duck';

export const REQUESTS_KEY = 'refumePoszukiwane';
const MAX_REQUESTS = 100;

const normalize = s =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Same perfume → same key, whoever asks for it. */
export const requestKey = ({ perfumeId, brand, name }) =>
  perfumeId ? `f:${perfumeId}` : `n:${normalize(`${brand || ''} ${name || ''}`)}`;

export const getMyRequests = currentUser => {
  const list = currentUser?.attributes?.profile?.privateData?.[REQUESTS_KEY];
  return Array.isArray(list) ? list : [];
};

const withRequests = (currentUser, list) => ({
  ...currentUser,
  attributes: {
    ...currentUser.attributes,
    profile: {
      ...currentUser.attributes.profile,
      privateData: { ...(currentUser.attributes.profile?.privateData || {}), [REQUESTS_KEY]: list },
    },
  },
});

/**
 * Adds or removes a request. Optimistic; rolls back on error.
 * @param {{ key?, name, brand?, perfumeId? }} request
 * @returns {Promise<boolean>} whether the user is watching it afterwards
 */
export const toggleRequest = request => (dispatch, getState, sdk) => {
  const currentUser = getState().user?.currentUser;
  if (!currentUser?.id) return Promise.reject(new Error('Not logged in'));
  const key = request.key || requestKey(request);
  const before = getMyRequests(currentUser);
  const watching = before.some(r => r.key === key);
  const after = watching
    ? before.filter(r => r.key !== key)
    : [
        {
          key,
          name: String(request.name).trim().slice(0, 80),
          brand: String(request.brand || '').trim().slice(0, 60),
          ...(request.perfumeId ? { perfumeId: request.perfumeId } : {}),
          createdAt: new Date().toISOString(),
        },
        ...before,
      ].slice(0, MAX_REQUESTS);

  dispatch(setCurrentUser(withRequests(currentUser, after)));
  return sdk.currentUser
    .updateProfile({ privateData: { [REQUESTS_KEY]: after } })
    .then(() => !watching)
    .catch(e => {
      const latest = getState().user?.currentUser;
      if (latest?.id) dispatch(setCurrentUser(withRequests(latest, before)));
      throw e;
    });
};

export const useMyRequests = () => {
  const dispatch = useDispatch();
  const currentUser = useSelector(state => state.user?.currentUser);
  const mine = getMyRequests(currentUser);
  return {
    isLoggedIn: !!currentUser?.id,
    mine,
    isWatching: key => mine.some(r => r.key === key),
    toggle: request => dispatch(toggleRequest(request)),
  };
};
