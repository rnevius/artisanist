export async function checkAuthentication(value, request = fetch) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('DEPLOY_URL must be an HTTPS origin without credentials.');
  }
  for (const path of ['/', '/api/recipes', '/health']) {
    const response = await request(new URL(path, url), {
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    await response.body?.cancel();
    if (
      response.status !== 401 ||
      !/^Basic\s/i.test(response.headers.get('www-authenticate') || '')
    ) {
      throw new Error(
        `Authentication check failed for ${path}: expected HTTP 401 with Basic authentication, got ${response.status}.`,
      );
    }
  }
}
