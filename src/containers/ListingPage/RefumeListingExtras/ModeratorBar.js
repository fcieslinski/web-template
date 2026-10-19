import React from 'react';
import { useSelector } from 'react-redux';

import { NamedLink } from '../../../components';
import { useModerationStatus } from '../../../util/refumeModeration';

import css from './RefumeListingExtras.module.css';

/** Refume: shortcut for moderators on someone else's listing. */
const ModeratorBar = ({ listing }) => {
  const userId = useSelector(state => state.user?.currentUser?.id?.uuid);
  const { isModerator } = useModerationStatus(userId);
  const id = listing?.id?.uuid;
  if (!isModerator || !id) return null;
  const hidden = listing?.attributes?.metadata?.moderacja?.ukryta;
  return (
    <div className={css.moderatorBar}>
      <span>
        Jesteś moderatorem.{hidden ? ' Ta oferta jest ukryta.' : ''}
      </span>
      <NamedLink name="ModeratorListingEditPage" params={{ id }} className={css.moderatorBarLink}>
        Edytuj ofertę
      </NamedLink>
    </div>
  );
};

export default ModeratorBar;
