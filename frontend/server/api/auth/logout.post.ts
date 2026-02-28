export default defineEventHandler((event) => {
  const cookieOpts = { httpOnly: true, secure: false, sameSite: 'lax' as const, path: '/' };
  setCookie(event, 'jwt', '', { ...cookieOpts, maxAge: 0 });
  setCookie(event, 'jwt_refresh', '', { ...cookieOpts, maxAge: 0 });
  return { success: true };
});