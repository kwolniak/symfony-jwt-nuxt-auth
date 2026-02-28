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
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 60 * 60,
      path: '/',
    });

    if (response.refresh_token) {
      setCookie(event, 'jwt_refresh', response.refresh_token, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
      });
    }

    return sendRedirect(event, '/dashboard');
  } catch {
    return sendRedirect(event, '/login?error=oauth_failed');
  }
});