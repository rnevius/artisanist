import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAuthentication } from '../scripts/deploy-auth.js';

test('deployment requires Basic authentication on every public entry point', async () => {
  const paths = [];
  await checkAuthentication(
    'https://recipes.example.com',
    async (url, options) => {
      paths.push(url.pathname);
      assert.equal(url.origin, 'https://recipes.example.com');
      assert.equal(options.redirect, 'manual');
      assert.ok(options.signal instanceof AbortSignal);
      return new Response(null, {
        status: 401,
        headers: { 'www-authenticate': 'Basic realm="recipes"' },
      });
    },
  );
  assert.deepEqual(paths, ['/', '/api/recipes', '/health']);
});

test('deployment rejects public access, redirects, and unrelated authentication', async () => {
  for (const [status, challenge] of [
    [200, 'Basic realm="recipes"'],
    [302, 'Basic realm="recipes"'],
    [503, 'Basic realm="recipes"'],
    [401, ''],
    [401, 'Bearer'],
  ]) {
    await assert.rejects(
      checkAuthentication('https://recipes.example.com', async () => {
        return new Response(null, {
          status,
          headers: { 'www-authenticate': challenge },
        });
      }),
      /Authentication check failed/,
    );
  }
});

test('deployment rejects an exposed API even when the homepage is protected', async () => {
  await assert.rejects(
    checkAuthentication('https://recipes.example.com', async (url) => {
      return new Response(null, {
        status: url.pathname === '/' ? 401 : 200,
        headers: { 'www-authenticate': 'Basic realm="recipes"' },
      });
    }),
    /Authentication check failed for \/api\/recipes/,
  );
});

test('deployment requires an HTTPS origin without credentials or a subpath', async () => {
  for (const url of [
    'http://recipes.example.com',
    'https://user:password@recipes.example.com',
    'https://recipes.example.com/recipes',
    'https://recipes.example.com?token=secret',
    'https://recipes.example.com#fragment',
  ]) {
    await assert.rejects(
      checkAuthentication(url, async () =>
        assert.fail('Must not send a request'),
      ),
      /DEPLOY_URL/,
    );
  }
});

test('deployment fails closed when the public endpoint cannot be reached', async () => {
  await assert.rejects(
    checkAuthentication('https://recipes.example.com', async () => {
      throw new Error('TLS certificate validation failed');
    }),
    /TLS certificate validation failed/,
  );
});
