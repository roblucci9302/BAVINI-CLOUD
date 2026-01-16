/**
 * OAuth Success Page Template
 *
 * Generates the HTML page shown after successful OAuth authentication.
 * Stores tokens in sessionStorage (more secure than localStorage against XSS).
 * Note: sessionStorage is cleared when tab closes, requiring re-auth per session.
 */

interface TokenData {
  provider: string;
  accessToken: string;
  tokenType: string;
  expiresIn?: number;
  refreshToken?: string;
  scope?: string;
  connectedAt: number;
}

/**
 * Generate the OAuth success page HTML.
 */
export function generateOAuthSuccessPage(tokenData: TokenData): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Connexion réussie - BAVINI</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #0a0a0a;
      color: #fff;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #333;
      border-top-color: #22c55e;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h1>Connexion réussie!</h1>
    <p>Redirection en cours...</p>
  </div>
  <script>
    // Security: Use sessionStorage instead of localStorage to reduce XSS risk
    // Tokens are cleared when the browser tab is closed
    const tokenData = ${JSON.stringify(tokenData)};
    const storageKey = 'bavini_oauth_tokens';

    // Read from sessionStorage, fallback to localStorage for migration
    let existing = {};
    try {
      existing = JSON.parse(sessionStorage.getItem(storageKey) || '{}');
      // Migration: if empty, check localStorage and migrate
      if (Object.keys(existing).length === 0) {
        const legacy = localStorage.getItem(storageKey);
        if (legacy) {
          existing = JSON.parse(legacy);
          // Clear localStorage after migration
          localStorage.removeItem(storageKey);
        }
      }
    } catch (e) {
      console.error('Failed to parse OAuth tokens:', e);
    }

    existing[tokenData.provider] = {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      tokenType: tokenData.tokenType,
      scope: tokenData.scope,
      connectedAt: tokenData.connectedAt,
      expiresAt: tokenData.expiresIn
        ? Date.now() + (tokenData.expiresIn * 1000)
        : undefined
    };

    sessionStorage.setItem(storageKey, JSON.stringify(existing));

    window.dispatchEvent(new CustomEvent('oauth-success', {
      detail: { provider: tokenData.provider }
    }));
    window.location.href = '/?oauth_success=' + tokenData.provider;
  </script>
</body>
</html>`;
}
