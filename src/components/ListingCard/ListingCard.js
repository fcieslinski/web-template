// ⚠️ If you modify the styling of this component and you're using the SectionListings component in your marketplace (featured listings)
// please reflect those changes in the calculateCarouselHeight function in SectionListing.js to avoid layout issues
import React from 'react';
import classNames from 'classnames';

import { useConfiguration } from '../../context/configurationContext';

import { useIntl } from '../../util/reactIntl';
import { requireListingImage } from '../../util/configHelpers';
import { lazyLoadWithDimensions } from '../../util/uiHelpers';
import { createSlug } from '../../util/urlHelpers';

import {
  AspectRatioWrapper,
  NamedLink,
  ResponsiveImage,
  ListingCardThumbnail,
} from '../../components';

import { getListingCardTranslations } from './ListingCard.helpers';
import { BottleLevelBadge, formatPricePerMl } from './ListingCard.refume';
import VerifiedProofBadge from '../VerifiedProofBadge/VerifiedProofBadge';
import FavoriteButton from '../FavoriteButton/FavoriteButton';
import { CardPriceWithBuyerFee } from '../RefumePrice/PriceWithBuyerFee';

import css from './ListingCard.module.css';

const LazyImage = lazyLoadWithDimensions(ResponsiveImage, { nearViewportMargin: 600 });

/**
 * ListingCardImage
 * Component responsible for rendering the image part of the listing card.
 * It either renders the first image from the listing's images array with lazy loading,
 * or a stylized placeholder if images are disabled for the listing type.
 * Also wraps the image in a fixed aspect ratio container for consistent layout.
 * @component
 * @param {Object} props
 * @param {Object} props.listing listing entity with image data
 * @param {Function?} props.setActivePropsMaybe mouse enter/leave handlers for map highlighting
 * @param {string} props.title listing title for alt text
 * @param {string} props.renderSizes img/srcset size rules
 * @param {number} props.aspectWidth aspect ratio width
 * @param {number} props.aspectHeight aspect ratio height
 * @param {string} props.variantPrefix image variant prefix (e.g. "listing-card")
 * @param {boolean} props.showListingImage whether to show actual listing image or not
 * @param {Object?} props.style the background color for the listing card with no image
 * @returns {JSX.Element} listing image with fixed aspect ratio or fallback preview
 */
const ListingCardImage = props => {
  const {
    listing,
    setActivePropsMaybe,
    title,
    renderSizes,
    aspectWidth,
    aspectHeight,
    variantPrefix,
    aspectRatioClassName,
    lazyLoadImage,
  } = props;

  const firstImage = listing?.images?.[0] || null;
  const variants = firstImage
    ? Object.keys(firstImage?.attributes?.variants).filter(k => k.startsWith(variantPrefix))
    : [];

  const aspectRatioClass = aspectRatioClassName || css.aspectRatioWrapper;
  const ImageComponent = lazyLoadImage ? LazyImage : ResponsiveImage;

  return (
    <AspectRatioWrapper
      className={aspectRatioClass}
      width={aspectWidth}
      height={aspectHeight}
      {...setActivePropsMaybe}
    >
      <ImageComponent
        rootClassName={css.rootForImage}
        alt={title}
        image={firstImage}
        variants={variants}
        sizes={renderSizes}
      />
      <BottleLevelBadge publicData={listing?.attributes?.publicData} id={listing?.id?.uuid} />
    </AspectRatioWrapper>
  );
};

/**
 * ListingCard
 *
 * @component
 * @param {Object} props
 * @param {string?} props.className add more style rules in addition to component's own css.root
 * @param {string?} props.rootClassName overwrite components own css.root
 * @param {string?} props.aspectRatioClassName custom className for AspectRatioWrapper component
 * @param {Object} props.listing API entity: listing or ownListing
 * @param {string?} props.renderSizes for img/srcset
 * @param {Function?} props.setActiveListing
 * @param {boolean?} props.showAuthorInfo
 * @param {boolean?} props.authorAbove Refume: show the seller above the photo instead of under the title
 * @param {boolean?} props.showBrand Refume: show the perfume brand under the title (default true)
 * @returns {JSX.Element} listing card to be used in search result panel etc.
 */
export const ListingCard = props => {
  const config = useConfiguration();
  const intl = props.intl || useIntl();

  const {
    className,
    rootClassName,
    aspectRatioClassName,
    darkMode,
    listing,
    renderSizes,
    setActiveListing,
    showAuthorInfo = false, // Refume: product tiles only, no seller name
    lazyLoadImage = true,
    authorAbove = false,
    showBrand = true,
    framed = false, // Refume: bordered tile (home page)
  } = props;

  const translations = getListingCardTranslations(listing, config, intl);
  const {
    titlePlain,
    titleFormatted,
    cardAriaLabel,
    showPrice,
    priceTooltip,
    priceMessage,
    authorName,
  } = translations;

  const classes = classNames(rootClassName || css.root, className);

  const id = listing?.id?.uuid;
  const { title = '', publicData, price } = listing?.attributes || {};
  const slug = createSlug(title);
  const pricePerMl = formatPricePerMl(price, publicData, intl, config.currency);
  // Refume: catalog-style cards show the seller above the photo and the brand under the title
  const sellerName = listing?.author?.attributes?.profile?.displayName || '';
  const brand = showBrand ? publicData?.marka : null;
  const showAuthorAbove = authorAbove && showAuthorInfo && sellerName;

  const { listingType, cardStyle } = publicData || {};
  const validListingTypes = config.listing.listingTypes || [];
  const foundListingTypeConfig = validListingTypes.find(conf => conf.listingType === listingType);
  // Render the listing image only if listing images are enabled in the listing type
  const showListingImage = requireListingImage(foundListingTypeConfig);

  const {
    aspectWidth = 1,
    aspectHeight = 1,
    variantPrefix = 'listing-card',
  } = config.layout.listingImage;

  // Sets the listing as active in the search map when hovered (if the search map is enabled)
  const setActivePropsMaybe = setActiveListing
    ? {
        onMouseEnter: () => setActiveListing(listing?.id),
        onMouseLeave: () => setActiveListing(null),
      }
    : null;

  return (
    // Refume: wrapper so the favourite button sits on the card without being inside the link
    <div className={classNames(css.cardWrapper, { [css.framed]: framed })}>
    <NamedLink
      className={classes}
      name="ListingPage"
      params={{ id, slug }}
      ariaLabel={cardAriaLabel}
    >
      {showAuthorAbove ? (
        <div className={classNames(css.sellerAbove, { [css.lightText]: darkMode })}>
          <span className={css.sellerInitial} aria-hidden="true">
            {sellerName.charAt(0).toUpperCase()}
          </span>
          <span className={css.sellerName}>{sellerName}</span>
        </div>
      ) : null}
      {showListingImage ? (
        <ListingCardImage
          renderSizes={renderSizes}
          title={titlePlain}
          listing={listing}
          setActivePropsMaybe={setActivePropsMaybe}
          aspectWidth={aspectWidth}
          aspectHeight={aspectHeight}
          variantPrefix={variantPrefix}
          aspectRatioClassName={aspectRatioClassName}
          lazyLoadImage={lazyLoadImage}
        />
      ) : (
        <ListingCardThumbnail
          style={cardStyle}
          listingTitle={title}
          className={aspectRatioClassName}
          width={aspectWidth}
          height={aspectHeight}
          setActivePropsMaybe={setActivePropsMaybe}
        />
      )}
      <div className={css.info}>
        {showPrice ? (
          <div className={css.price} title={priceTooltip}>
            {priceMessage}
            {publicData?.unitType === 'item' ? (
              <span className={css.priceFee}>
                <CardPriceWithBuyerFee price={price} intl={intl} />
              </span>
            ) : null}
          </div>
        ) : null}
        <div className={css.mainInfo}>
          {showListingImage && (
            <div className={classNames(css.title, { [css.lightText]: darkMode })}>
              {titleFormatted}
            </div>
          )}
          {brand || pricePerMl ? (
            <div className={classNames(css.brand, { [css.lightText]: darkMode })}>
              {[brand, pricePerMl].filter(Boolean).join(' · ')}
            </div>
          ) : null}
          <VerifiedProofBadge
            metadata={listing?.attributes?.metadata}
            compact
            className={css.verifiedBadge}
          />
          {showAuthorInfo && !showAuthorAbove ? (
            <div className={classNames(css.authorInfo, { [css.lightText]: darkMode })}>
              {authorName}
            </div>
          ) : null}
        </div>
      </div>
    </NamedLink>
    {showListingImage ? (
      <FavoriteButton
        listingUuid={id}
        title={titlePlain}
        className={classNames(css.favorite, { [css.favoriteBelowSeller]: showAuthorAbove })}
      />
    ) : null}
    </div>
  );
};

export default ListingCard;
