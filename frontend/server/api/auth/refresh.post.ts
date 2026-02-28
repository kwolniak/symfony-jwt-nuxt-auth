export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const refreshToken = getCookie(event, 'jwt_refresh');

  if (!refreshToken) throw createError({ statusCode: 401, message: 'No refresh token' });

  const response = await $fetch<{ token: string; refresh_token?: string }>(
    `${config.apiBaseUrl}/api/token/refresh`,
    { method: 'POST', body: { refresh_token: refreshToken } },
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

  return { success: true };
});