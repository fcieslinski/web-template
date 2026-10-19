/**
 * Refume: proof-of-purchase verification.
 *
 * Data model (keep in sync with server/api/refume-moderation.js):
 * - listing privateData.dowodZakupu = { imageId, url, uploadedAt }  — set by the seller
 * - listing privateData.weryfikacjaPowod = rejection reason          — set by a moderator
 * - listing metadata.weryfikacja = { status, dowodUploadedAt, sprawdzonoAt } — set by a moderator
 *     status: 'zweryfikowano' | 'odrzucono'
 *
 * privateData is only visible to the seller (and the marketplace operator), so buyers
 * never see the proof itself or the rejection reason. metadata is public and can't be
 * written by sellers, so the badge can't be faked.
 */

export const PROOF_STATUS = {
  NONE: 'none',
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
};

/** Public: whether a listing shows the "verified by proof of purchase" badge. */
export const isVerifiedByProof = metadata => metadata?.weryfikacja?.status === 'zweryfikowano';

/**
 * Seller's view of the proof status for their own listing.
 * @returns {{ status: string, reason?: string, proof?: Object }}
 */
export const getProofStatus = (privateData, metadata) => {
  const proof = privateData?.dowodZakupu;
  const decision = metadata?.weryfikacja;

  if (!proof?.url) {
    // A moderator may have set the badge by hand without a proof upload
    return decision?.status === 'zweryfikowano'
      ? { status: PROOF_STATUS.VERIFIED }
      : { status: PROOF_STATUS.NONE };
  }
  // The latest decision applies only to the upload it was made for
  if (!decision || decision.dowodUploadedAt !== proof.uploadedAt) {
    return { status: PROOF_STATUS.PENDING, proof };
  }
  if (decision.status === 'zweryfikowano') {
    return { status: PROOF_STATUS.VERIFIED, proof };
  }
  return { status: PROOF_STATUS.REJECTED, proof, reason: privateData?.weryfikacjaPowod || '' };
};
