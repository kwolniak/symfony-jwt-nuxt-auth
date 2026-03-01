export default defineEventHandler((event) => {
  const config = useRuntimeConfig();
  // oauthBaseUrl must be http://localhost (not sfl-api.test) because Google rejects .test TLDs.
  // Nginx routes unmatched server_name requests to the first vhost (Symfony).
  return sendRedirect(event, `${config.oauthBaseUrl}/connect/google`, 302);
});
