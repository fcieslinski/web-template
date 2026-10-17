/**
 * Refume: minimal Integration API client using plain fetch (no extra dependencies).
 *
 * Used by the moderation endpoints to read listings' private data and to write the
 * verification result into listing metadata / private data — things the
 * Marketplace API (and the sellers themselves) can't do.
 *
 * Needs an Integration API application from Console (Build → Advanced → Applications):
 *   SHARETRIBE_INTEGRATION_CLIENT_ID
 *   SHARETRIBE_INTEGRATION_CLIENT_SECRET
 */
const BASE_URL =
  process.env.SHARETRIBE_INTEGRATION_BASE_URL || 'https://flex-integ-api.sharetribe.com';

let cachedToken = null; // { accessToken, expiresAt }

const isConfigured = () =>
  !!process.env.SHARETRIBE_INTEGRATION_CLIENT_ID &&
  !!process.env.SHARETRIBE_INTEGRATION_CLIENT_SECRET;

const apiError = (status, message, data = {}) => {
  const error = new Error(message);
  error.status = status;
  error.statusText = message;
  error.data = data;
  return error;
};

const getAccessToken = async () => {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 60 * 1000 > now) {
    return cachedToken.accessToken;
  }
  if (!isConfigured()) {
    throw apiError(500, 'Integration API credentials are missing (see .env).');
  }

  const body = new URLSearchParams({
    client_id: process.env.SHARETRIBE_INTEGRATION_CLIENT_ID,
    client_secret: process.env.SHARETRIBE_INTEGRATION_CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'integ',
  });
  const res = await fetch(`${BASE_URL}/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  if (!res.ok) {
    throw apiError(res.status, 'Integration API authentication failed.');
  }
  const json = await res.json();
  cachedToken = {
    accessToken: json.access_token,
    expiresAt: now + (json.expires_in || 3600) * 1000,
  };
  return cachedToken.accessToken;
};

const integrationRequest = async (method, path, { query, body } = {}) => {
  const token = await getAccessToken();
  const queryString = query ? `?${new URLSearchParams(query).toString()}` : '';
  const res = await fetch(`${BASE_URL}/v1/integration_api${path}${queryString}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw apiError(res.status, `Integration API ${path} failed.`, json);
  }
  return json;
};

module.exports = {
  isIntegrationApiConfigured: isConfigured,
  queryListings: query => integrationRequest('GET', '/listings/query', { query }),
  showListing: query => integrationRequest('GET', '/listings/show', { query }),
  updateListing: body => integrationRequest('POST', '/listings/update', { body }),
  queryUsers: query => integrationRequest('GET', '/users/query', { query }),
  showUser: query => integrationRequest('GET', '/users/show', { query }),
  updateUserProfile: body => integrationRequest('POST', '/users/update_profile', { body }),
  showTransaction: query => integrationRequest('GET', '/transactions/show', { query }),
  updateTransactionMetadata: body =>
    integrationRequest('POST', '/transactions/update_metadata', { body }),
};
