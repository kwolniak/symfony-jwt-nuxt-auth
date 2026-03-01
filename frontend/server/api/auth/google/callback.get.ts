export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const { code } = getQuery(event);

  if (!code || typeof code !== 'string') {
    return sendRedirect(event, '/login?error=missing_code');
  }

  try {
    const response = await $fetch<{ token: string; refresh_token?: string }>(
      `${config.apiBaseUrl}/api/auth/exchange-code`,
      { method: 'POST', body: { code } },
    );

    setCookie(event, 'jwt', response.token, {
      ...jwtCookieOptions(),
      maxAge: 60 * 60,
    });

    if (response.refresh_token) {
      setCookie(event, 'jwt_refresh', response.refresh_token, {
        ...jwtCookieOptions(),
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    return sendRedirect(event, '/dashboard');
  } catch (err) {
    console.error('[OAuth callback] Code exchange failed:', err);
    return sendRedirect(event, '/login?error=oauth_failed');
  }
});
