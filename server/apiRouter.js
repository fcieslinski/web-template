/**
 * This file contains server side endpoints that can be used to perform backend
 * tasks that can not be handled in the browser.
 *
 * The endpoints should not clash with the application routes. Therefore, the
 * endpoints are prefixed in the main server where this file is used.
 */

const express = require('express');
const bodyParser = require('body-parser');
const { deserialize } = require('./api-util/sdk');

const initiateLoginAs = require('./api/initiate-login-as');
const loginAs = require('./api/login-as');
const { makeOffer, respondToOffer } = require('./api/refume-offers');
const { searchPerfumes } = require('./api/refume-perfumes');
const { listRequests, notifyForListing } = require('./api/refume-requests');
const { getBadges, recomputeForTransaction } = require('./api/refume-badges');
const { recordView, syncLike } = require('./api/refume-stats');
const { getAiDescription } = require('./api/refume-ai-description');
const transactionLineItems = require('./api/transaction-line-items');
const initiatePrivileged = require('./api/initiate-privileged');
const transitionPrivileged = require('./api/transition-privileged');
const deleteAccount = require('./api/delete-account');
const { listPendingProofs, decideProof } = require('./api/refume-moderation');
const {
  getStatus: moderationStatus,
  getPanel: moderationPanel,
  listingAction: moderationListingAction,
  userAction: moderationUserAction,
  undoProofDecision,
  reportAction: moderationReportAction,
  createReport,
  getConversation: moderationConversation,
  chatFlagAction: moderationChatFlag,
  getListingForEdit: moderationGetListing,
  editListing: moderationEditListing,
  getUserBadges: moderationGetUserBadges,
  setUserBadges: moderationSetUserBadges,
  setListingVerified: moderationSetListingVerified,
  photosOk: moderationPhotosOk,
} = require('./api/refume-moderation-panel');
const {
  sendMessage: moderationSendMessage,
  saveNote: moderationSaveNote,
  search: moderationSearch,
  getUserCard: moderationUserCard,
  createAppeal,
  decideAppeal: moderationDecideAppeal,
} = require('./api/refume-moderation-users');
const { getDisputes, disputeAction } = require('./api/refume-disputes');
const { requestPhotoCheck } = require('./api/refume-photo-check');
const { checkConversation } = require('./api/refume-chat-flags');
const { recordTrace } = require('./api/refume-traces');
const refumeShipmentsApi = require('./api/refume-shipments');

const createUserWithIdp = require('./api/auth/createUserWithIdp');

const { authenticateFacebook, authenticateFacebookCallback } = require('./api/auth/facebook');
const { authenticateGoogle, authenticateGoogleCallback } = require('./api/auth/google');

const { startBundleSweep } = require('./api-util/refumeBundles');

const router = express.Router();

// Refume: gives back stock of bundle items when an order expires or is cancelled
startBundleSweep();
require('./api-util/refumeRetention').startRetention();
// Refume: labels and tracking through Furgonetka for paid orders
require('./api-util/refumeShipments').startShipments();

// ================ API router middleware: ================ //

// Parse Transit body first to a string
router.use(
  bodyParser.text({
    type: 'application/transit+json',
  })
);

// Deserialize Transit body string to JS data
router.use((req, res, next) => {
  if (req.get('Content-Type') === 'application/transit+json' && typeof req.body === 'string') {
    try {
      req.body = deserialize(req.body);
    } catch (e) {
      console.error('Failed to parse request body as Transit:');
      console.error(e);
      res.status(400).send('Invalid Transit in request body.');
      return;
    }
  }
  next();
});

// ================ API router endpoints: ================ //

router.get('/initiate-login-as', initiateLoginAs);
router.get('/login-as', loginAs);
router.post('/transaction-line-items', transactionLineItems);
router.post('/initiate-privileged', initiatePrivileged);
router.post('/transition-privileged', transitionPrivileged);
router.post('/delete-account', deleteAccount);

// Refume: moderation of proof-of-purchase photos (moderators only)
router.get('/moderacja/dowody', listPendingProofs);
router.post('/moderacja/decyzja', decideProof);
router.get('/moderacja/status', moderationStatus);
router.get('/moderacja/panel', moderationPanel);
router.post('/moderacja/oferta', moderationListingAction);
router.post('/moderacja/uzytkownik', moderationUserAction);
router.post('/moderacja/cofnij-dowod', undoProofDecision);
router.post('/moderacja/zgloszenie', moderationReportAction);
router.post('/zgloszenia', createReport);
router.get('/moderacja/rozmowa', moderationConversation);
router.post('/moderacja/flaga', moderationChatFlag);
router.get('/moderacja/oferta', moderationGetListing);
router.post('/moderacja/oferta-edycja', moderationEditListing);
router.get('/moderacja/uzytkownik', moderationGetUserBadges);
router.post('/moderacja/odznaki-konta', moderationSetUserBadges);
router.post('/moderacja/znacznik-oferty', moderationSetListingVerified);
router.post('/moderacja/zdjecia-ok', moderationPhotosOk);
router.post('/zdjecia/sprawdz', requestPhotoCheck);
router.post('/moderacja/wiadomosc', moderationSendMessage);
router.post('/moderacja/notatka', moderationSaveNote);
router.get('/moderacja/szukaj', moderationSearch);
router.get('/moderacja/karta', moderationUserCard);
router.post('/moderacja/odwolanie', moderationDecideAppeal);
router.post('/odwolania', createAppeal);
router.get('/moderacja/spory', getDisputes);
router.post('/moderacja/spor', disputeAction);
router.post('/czat/sprawdz', checkConversation);
router.post('/oferty/zloz', makeOffer);
router.post('/oferty/odpowiedz', respondToOffer);
router.get('/perfumy', searchPerfumes);
router.get('/poszukiwane', listRequests);
router.post('/poszukiwane/powiadom', notifyForListing);
router.get('/odznaki', getBadges);
router.post('/odznaki/przelicz', recomputeForTransaction);
router.post('/slad', recordTrace);
router.get('/przesylka', refumeShipmentsApi.getShipment);
router.get('/przesylka/etykieta', refumeShipmentsApi.getLabel);
router.post('/przesylka/ponow', refumeShipmentsApi.retry);
router.post('/przesylka/punkt', refumeShipmentsApi.changePoint);
router.post('/przesylka/symuluj', refumeShipmentsApi.simulate);
router.post('/furgonetka/webhook', bodyParser.json({ limit: '64kb' }), refumeShipmentsApi.webhook);
router.post('/statystyki/wyswietlenie', recordView);
router.post('/statystyki/polubienie', syncLike);
router.get('/opis-ai', getAiDescription);

// Create user with identity provider (e.g. Facebook or Google)
// This endpoint is called to create a new user after user has confirmed
// they want to continue with the data fetched from IdP (e.g. name and email)
router.post('/auth/create-user-with-idp', createUserWithIdp);

// Facebook authentication endpoints

// This endpoint is called when user wants to initiate authenticaiton with Facebook
router.get('/auth/facebook', authenticateFacebook);

// This is the route for callback URL the user is redirected after authenticating
// with Facebook. In this route a Passport.js custom callback is used for calling
// loginWithIdp endpoint in Sharetribe Auth API to authenticate user to the marketplace
router.get('/auth/facebook/callback', authenticateFacebookCallback);

// Google authentication endpoints

// This endpoint is called when user wants to initiate authenticaiton with Google
router.get('/auth/google', authenticateGoogle);

// This is the route for callback URL the user is redirected after authenticating
// with Google. In this route a Passport.js custom callback is used for calling
// loginWithIdp endpoint in Sharetribe Auth API to authenticate user to the marketplace
router.get('/auth/google/callback', authenticateGoogleCallback);

module.exports = router;
