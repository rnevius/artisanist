import Fastify from 'fastify';
import { readFileSync } from 'node:fs';
import { openDatabase, recipeStore } from './db.js';
import { recipeSchema, scaleByReference, validateRecipe } from './recipe.js';
import { card, editor, errorPage, library } from './views.js';

export function createApp({ databasePath, logger = false } = {}) {
  const app = Fastify({
    logger,
    bodyLimit: 1024 * 1024,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  const db = openDatabase(databasePath);
  const store = recipeStore(db);
  app.addHook('onClose', async () => db.close());
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'no-store');
    return payload;
  });
  // A local tool has no login. Reject browser writes from another origin.
  app.addHook('onRequest', async (request, reply) => {
    if (['POST', 'PUT', 'DELETE'].includes(request.method)) {
      const origin = request.headers.origin;
      if (
        request.headers['sec-fetch-site'] === 'cross-site' ||
        (origin && origin !== `${request.protocol}://${request.host}`)
      ) {
        return reply
          .code(403)
          .send({ message: 'Requests must come from this app.' });
      }
    }
  });

  for (const [url, path, type] of [
    ['/style.css', '../public/style.css', 'text/css'],
    ['/editor.js', '../public/editor.js', 'text/javascript'],
    ['/card.js', '../public/card.js', 'text/javascript'],
    ['/recipe.js', './recipe.js', 'text/javascript'],
  ]) {
    app.get(url, async (_request, reply) =>
      reply
        .type(type)
        .send(readFileSync(new URL(path, import.meta.url), 'utf8')),
    );
  }
  const html = (reply, value) => reply.type('text/html').send(value);
  const find = (request, reply) => {
    const id = Number(request.params.id);
    const recipe = Number.isSafeInteger(id) && id > 0 ? store.get(id) : null;
    if (!recipe) {
      if (request.url.startsWith('/api/'))
        reply.code(404).send({ message: 'Recipe not found.' });
      else html(reply.code(404), errorPage(404, 'This recipe does not exist.'));
    }
    return recipe;
  };
  const check = (recipe, reply, id) => {
    const error = validateRecipe(recipe);
    if (error) {
      reply.code(400).send({ message: error });
      return false;
    }
    for (const ingredient of recipe.groups.flatMap(
      (group) => group.ingredients,
    )) {
      if (
        ingredient.componentId &&
        (ingredient.componentId === id || !store.get(ingredient.componentId))
      ) {
        reply.code(400).send({
          message:
            'Component recipes must exist and cannot reference the recipe itself.',
        });
        return false;
      }
    }
    return true;
  };

  app.get('/', async (_request, reply) => html(reply, library(store.list())));
  app.get('/recipes/new', async (_request, reply) =>
    html(reply, editor(null, store.list())),
  );
  app.get('/recipes/:id/edit', async (request, reply) => {
    const recipe = find(request, reply);
    if (recipe)
      return html(
        reply,
        editor(
          recipe,
          store.list().filter((item) => item.id !== recipe.id),
        ),
      );
  });
  app.get('/recipes/:id', async (request, reply) => {
    const recipe = find(request, reply);
    if (!recipe) return;
    let scale =
      request.query.scale === undefined ? 1 : Number(request.query.scale);
    let ingredientTarget;
    if (
      request.query.ingredientAmount !== undefined ||
      request.query.ingredientUnit !== undefined
    ) {
      const reference = recipe.groups
        .flatMap((group) => group.ingredients)
        .find((item) => item.id === recipe.referenceId);
      const quantity = request.query.ingredientAmount;
      const unit = request.query.ingredientUnit;
      if (typeof quantity !== 'string' || typeof unit !== 'string') {
        return html(
          reply.code(400),
          errorPage(
            400,
            'Enter a positive ingredient amount and a weight unit.',
          ),
        );
      }
      scale = scaleByReference(reference, quantity, unit);
      if (scale === null) {
        return html(
          reply.code(400),
          errorPage(
            400,
            'Scaling by ingredient requires a 100% reference ingredient and a positive weight in g, kg, mg, oz, or lb.',
          ),
        );
      }
      ingredientTarget = { quantity, unit: unit.trim().toLowerCase() };
    }
    if (!Number.isFinite(scale) || scale < 0.001 || scale > 1000)
      return html(
        reply.code(400),
        errorPage(
          400,
          'The quantity multiplier must be between 0.001 and 1000.',
        ),
      );
    return html(reply, card(recipe, scale, store.list(), ingredientTarget));
  });
  app.get('/api/recipes', async () => store.list());
  app.get('/api/recipes/:id', async (request, reply) => find(request, reply));
  app.post(
    '/api/recipes',
    { schema: { body: recipeSchema } },
    async (request, reply) => {
      if (!check(request.body, reply)) return;
      const recipe = store.create(request.body);
      return reply
        .code(201)
        .header('Location', `/recipes/${recipe.id}`)
        .send(recipe);
    },
  );
  app.put(
    '/api/recipes/:id',
    { schema: { body: recipeSchema } },
    async (request, reply) => {
      const recipe = find(request, reply);
      if (!recipe || !check(request.body, reply, recipe.id)) return;
      return store.update(recipe.id, request.body);
    },
  );
  app.delete('/api/recipes/:id', async (request, reply) => {
    const recipe = find(request, reply);
    if (!recipe) return;
    const references = store.references(recipe.id);
    if (references.length)
      return reply.code(409).send({
        message: `This recipe is used by ${references.map((item) => item.title).join(', ')}. Remove those component links before deleting it.`,
      });
    store.delete(recipe.id);
    return reply.code(204).send();
  });
  app.setNotFoundHandler(async (_request, reply) =>
    html(reply.code(404), errorPage(404, 'This page does not exist.')),
  );
  app.setErrorHandler(async (error, request, reply) => {
    if (error.statusCode && error.statusCode < 500)
      return reply.code(error.statusCode).send({ message: error.message });
    request.log.error(error);
    if (request.url.startsWith('/api/'))
      return reply
        .code(500)
        .send({ message: 'Unable to save or load recipes. Please try again.' });
    return html(
      reply.code(500),
      errorPage(500, 'Unable to load this page. Please try again.'),
    );
  });
  return app;
}
