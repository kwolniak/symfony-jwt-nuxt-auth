export default defineEventHandler((event) => {
  setCookie(event, 'jwt', '', { ...jwtCookieOptions(), maxAge: 0 });
  setCookie(event, 'jwt_refresh', '', { ...jwtCookieOptions(), maxAge: 0 });
  return { success: true };
});