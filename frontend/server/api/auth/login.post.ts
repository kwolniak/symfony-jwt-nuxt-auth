export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody(event);

  const response = await $fetch<{ token: string; refresh_token?: string }>(
    `${config.apiBaseUrl}/api/login_check`,
    { method: 'POST', body },
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