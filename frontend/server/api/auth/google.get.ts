export default defineEventHandler((event) => {
  // Redirect to Symfony's OAuth initiation URL.
  // APP_URL must be http://localhost (not sfl-api.test) because Google rejects .test TLDs.
  // Nginx routes unmatched server_name requests to the first vhost (Symfony).
  return sendRedirect(event, `${process.env.APP_URL ?? 'http://localhost'}/connect/google`, 302);
});