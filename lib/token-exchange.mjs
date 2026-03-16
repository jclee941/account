const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export async function exchangeAuthCode({ code, clientId, clientSecret, redirectUri }) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = await response.json();

  if (!response.ok) {
    throw new Error(`Token exchange failed (${response.status}): ${JSON.stringify(json)}`);
  }

  if (!json.access_token || !json.token_type) {
    throw new Error('Token exchange succeeded but expected token fields were missing');
  }

  return json;
}
