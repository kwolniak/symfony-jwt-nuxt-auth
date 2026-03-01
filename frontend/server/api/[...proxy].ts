import { FetchError } from 'ofetch';

const refreshLocks = new Map<string, Promise<{ token: string; refresh_token?: string }>>();

function doRefresh(apiBaseUrl: string, refreshToken: string) {
  const existing = refreshLocks.get(refreshToken);
  if (existing) return existing;

  const promise = $fetch<{ token: string; refresh_token?: string }>(
    `${apiBaseUrl}/api/token/refresh`,
    { method: 'POST', body: { refresh_token: refreshToken } },
  ).finally(() => refreshLocks.delete(refreshToken));

  refreshLocks.set(refreshToken, promise);
  return promise;
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const jwt = getCookie(event, 'jwt');

  const path = getRouterParam(event, 'proxy');
  const query = getQuery(event);

  const method = event.method;
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
  const body = hasBody ? await readBody(event) : undefined;

  const makeRequest = (token: string | undefined): Promise<unknown> =>
    $fetch(`${config.apiBaseUrl}/api/${path}`, {
      method,
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(hasBody && { 'Content-Type': 'application/json' }),
      },
      query,
      body,
    });

  try {
    return await makeRequest(jwt);
  } catch (err) {
    if (err instanceof FetchError && err.response?.status === 401) {
      const refreshToken = getCookie(event, 'jwt_refresh');
      if (!refreshToken) throw createError({ statusCode: 401, data: err.data });

      try {
        const refreshed = await doRefresh(config.apiBaseUrl, refreshToken);

        setCookie(event, 'jwt', refreshed.token, {
          ...jwtCookieOptions(),
          maxAge: 60 * 60,
        });

        if (refreshed.refresh_token) {
          setCookie(event, 'jwt_refresh', refreshed.refresh_token, {
            ...jwtCookieOptions(),
            maxAge: 60 * 60 * 24 * 30,
          });
        }

        return await makeRequest(refreshed.token);
      } catch {
        throw createError({ statusCode: 401 });
      }
    }

    if (err instanceof FetchError && err.response) {
      throw createError({ statusCode: err.response.status, data: err.data });
    }
    throw err;
  }
});
