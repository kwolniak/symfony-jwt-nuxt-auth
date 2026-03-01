export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const { username, password } = await readBody(event);

  const response = await $fetch<{ token: string; refresh_token?: string }>(
    `${config.apiBaseUrl}/api/login_check`,
    { method: 'POST', body: { username, password } },
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

  return { success: true };
});
