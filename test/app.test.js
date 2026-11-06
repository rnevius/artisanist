import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { exampleRecipe } from './fixtures.js';

async function setup(t) {
  const app = createApp({ databasePath: ':memory:' });
  t.after(() => app.close());
  return app;
}

const create = (app, payload = exampleRecipe()) =>
  app.inject({ method: 'POST', url: '/api/recipes', payload });

test('CRUD preserves stage, ingredient, and step order across database reopen and migrations', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'artisanist-test-'));
  const databasePath = join(directory, 'recipes.sqlite');
  let app = createApp({ databasePath });
  t.after(async () => {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const input = exampleRecipe();
  input.categories = ['Bread', 'Fermentations'];
  const response = await create(app, input);
  assert.equal(response.statusCode, 201);
  const { id } = response.json();
  assert.equal(response.headers.location, `/recipes/${id}`);
  await app.close();
  app = createApp({ databasePath });
  const saved = (await app.inject(`/api/recipes/${id}`)).json();
  for (const key of Object.keys(input))
    assert.deepEqual(saved[key], input[key]);
  const changed = structuredClone(input);
  changed.title = 'Updated sauce';
  changed.categories = [];
  changed.groups.reverse();
  changed.groups[0].ingredients.reverse();
  changed.groups[0].steps.reverse();
  const update = await app.inject({
    method: 'PUT',
    url: `/api/recipes/${id}`,
    payload: changed,
  });
  assert.equal(update.statusCode, 200);
  assert.deepEqual(update.json().groups, changed.groups);
  assert.deepEqual(update.json().categories, []);
  assert.equal(
    (await app.inject('/api/recipes')).json()[0].title,
    changed.title,
  );
  assert.equal(
    (await app.inject({ method: 'DELETE', url: `/api/recipes/${id}` }))
      .statusCode,
    204,
  );
  assert.equal((await app.inject(`/api/recipes/${id}`)).statusCode, 404);
  assert.equal((await app.inject(`/recipes/${id}`)).statusCode, 404);
});

test('cards align group ingredients and steps, calculate ratios, scale numeric quantities, and escape text', async (t) => {
  const app = await setup(t);
  const input = exampleRecipe();
  input.title = '<script>alert("recipe")</script>';
  input.groups[0].ingredients[0].name = '<img src=x onerror=alert(1)>';
  input.groups[1].ingredients[0].specialPercent = '30';
  input.groups[1].ingredients[0].specialBasis = 'total liquid weight';
  const { id } = (await create(app, input)).json();
  const response = await app.inject(`/recipes/${id}?scale=2`);
  assert.equal(response.statusCode, 200);
  const html = response.body;
  assert.match(html, /rowspan="2"/);
  assert.match(html, /<td>200 g<\/td>/);
  assert.match(html, /50%/);
  assert.match(html, /400 g/);
  assert.match(html, /as needed/);
  assert.match(html, /start="3"/);
  assert.match(html, /<strong>60 °C<\/strong>/);
  assert.match(html, /30% of total liquid weight/);
  assert.match(html, /275 g/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>alert|<img src=x/);
  assert.match(
    response.headers['content-security-policy'],
    /frame-ancestors 'none'/,
  );
  const editor = await app.inject(`/recipes/${id}/edit`);
  assert.match(editor.body, /\\u003cscript/);
  assert.doesNotMatch(editor.body, /<script>alert/);
  for (const scale of ['0', '-1', 'Infinity', 'NaN', '1001']) {
    assert.equal(
      (await app.inject(`/recipes/${id}?scale=${scale}`)).statusCode,
      400,
    );
  }
});

test('cards scale fractional yields and ingredients while preserving authored quantities', async (t) => {
  const app = await setup(t);
  const input = exampleRecipe();
  input.yield = '1/2 cup / 2 portions';
  input.groups[1].ingredients[0].quantity = '1/2';
  input.groups[1].ingredients[0].unit = 'kg';
  input.groups[1].ingredients[1].quantity = '1/3';
  input.groups[1].ingredients[1].unit = 'Tbsp';
  const { id } = (await create(app, input)).json();
  const response = await app.inject(`/recipes/${id}?scale=2`);
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Yields 1 cup \/ 4 portions/);
  assert.match(response.body, /Original yield: 1\/2 cup \/ 2 portions/);
  assert.match(response.body, /<td>2 tsp<\/td>/);
  assert.match(response.body, /id="ingredient-amount"[^>]*value="1"/);
  const targeted = await app.inject(
    `/recipes/${id}?ingredientAmount=1&ingredientUnit=kg`,
  );
  assert.match(targeted.body, /Yields 1 cup \/ 4 portions/);
  const saved = (await app.inject(`/api/recipes/${id}`)).json();
  assert.equal(saved.yield, input.yield);
  assert.deepEqual(saved.groups, input.groups);
});

test('cards display practical cup measures without changing the saved recipe', async (t) => {
  const app = await setup(t);
  const input = exampleRecipe();
  input.yield = '1/8 cup';
  input.groups[0].ingredients[0].quantity = '1 3/8';
  input.groups[0].ingredients[0].unit = 'cup';
  const { id } = (await create(app, input)).json();
  const original = await app.inject(`/recipes/${id}`);
  assert.match(original.body, /Yields 2 tbsp/);
  assert.match(original.body, /<td>1 cup \+ 6 tbsp<\/td>/);
  const scaled = await app.inject(`/recipes/${id}?scale=3`);
  assert.match(scaled.body, /Yields 6 tbsp/);
  assert.match(scaled.body, /Original yield: 1\/8 cup/);
  assert.match(scaled.body, /<td>4 cups \+ 2 tbsp<\/td>/);
  const saved = (await app.inject(`/api/recipes/${id}`)).json();
  assert.equal(saved.yield, input.yield);
  assert.deepEqual(saved.groups, input.groups);
});

test('cards normalize spoons and metric units while preserving authored values', async (t) => {
  const app = await setup(t);
  const input = exampleRecipe();
  input.yield = '500 ml';
  const ingredients = input.groups.flatMap((group) => group.ingredients);
  for (const [index, [quantity, unit]] of [
    ['4', 'tsp'],
    ['8', 'tbsp'],
    ['0.25', 'kg'],
    ['0.5', 'tsp'],
  ].entries()) {
    Object.assign(ingredients[index], { quantity, unit });
  }
  const { id } = (await create(app, input)).json();
  const original = await app.inject(`/recipes/${id}`);
  for (const amount of ['1 tbsp + 1 tsp', '1/2 cup', '250 g', '1/2 tsp'])
    assert.ok(original.body.includes(`<td>${amount}</td>`));
  const scaled = await app.inject(`/recipes/${id}?scale=2`);
  assert.match(scaled.body, /Yields 1 L/);
  assert.match(scaled.body, /Original yield: 500 ml/);
  for (const amount of ['2 tbsp + 2 tsp', '1 cup', '500 g', '1 tsp'])
    assert.ok(scaled.body.includes(`<td>${amount}</td>`));
  const saved = (await app.inject(`/api/recipes/${id}`)).json();
  assert.equal(saved.yield, input.yield);
  assert.deepEqual(saved.groups, input.groups);
});

test('scales from a reference weight in another unit without changing the saved recipe', async (t) => {
  const app = await setup(t);
  const { id } = (await create(app)).json();
  const response = await app.inject(
    `/recipes/${id}?ingredientAmount=0.5&ingredientUnit=kg`,
  );
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /500 g/);
  assert.match(response.body, /<td>250 g<\/td>/);
  assert.match(response.body, /Yields 687\.5 g/);
  assert.match(response.body, /name="scale"[^>]*value="2.5"/);
  assert.match(response.body, /value="kg" selected/);
  const saved = (await app.inject(`/api/recipes/${id}`)).json();
  assert.equal(saved.groups[1].ingredients[0].quantity, '200');
  assert.equal(saved.yield, '275 g');
  for (const query of [
    'ingredientAmount=0&ingredientUnit=g',
    'ingredientAmount=-10&ingredientUnit=g',
    'ingredientAmount=2&ingredientUnit=ml',
    'ingredientAmount=2',
    'ingredientUnit=kg',
    'ingredientAmount=NaN&ingredientUnit=g',
    'ingredientAmount=999999&ingredientUnit=kg',
  ]) {
    assert.equal(
      (await app.inject(`/recipes/${id}?${query}`)).statusCode,
      400,
      query,
    );
  }
  const withoutReference = exampleRecipe();
  withoutReference.referenceId = null;
  const other = (await create(app, withoutReference)).json();
  assert.equal(
    (
      await app.inject(
        `/recipes/${other.id}?ingredientAmount=1&ingredientUnit=kg`,
      )
    ).statusCode,
    400,
  );
  assert.doesNotMatch(
    (await app.inject(`/recipes/${other.id}`)).body,
    /ingredient-amount/,
  );
});

test('procedure emphasis preserves durations, ranges, and escaped text when scaling', async (t) => {
  const app = await setup(t);
  const input = exampleRecipe();
  input.groups[0].steps = [
    'Heat at 150–160 °C for 5–6 minutes.',
    'Whisk for 30 sec, then rest for 1.5 hours.',
    'Chill at -18 °C for 2 to 3 hrs.',
    'Mix for 10 s, wait 1 min, then refrigerate for 12 h.',
    'Keep 25 g, 2 cloves, and 3 mint leaves aside.',
    '<img src=x onerror=alert(1)> Wait <5 minutes & stir.',
  ];
  const { id } = (await create(app, input)).json();
  const { body } = await app.inject(`/recipes/${id}?scale=2`);
  assert.deepEqual(
    [...body.matchAll(/<strong>(.*?)<\/strong>/g)].map((match) => match[1]),
    [
      '150–160 °C',
      '5–6 minutes',
      '30 sec',
      '1.5 hours',
      '-18 °C',
      '2 to 3 hrs',
      '10 s',
      '1 min',
      '12 h',
      '5 minutes',
      '60 °C',
      '140 °F',
    ],
  );
  assert.match(body, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(body, /Wait &lt;<strong>5 minutes<\/strong> &amp; stir/);
  assert.deepEqual(
    (await app.inject(`/api/recipes/${id}`)).json().groups,
    input.groups,
  );
});

test('invalid documents never replace an existing recipe', async (t) => {
  const app = await setup(t);
  const { id } = (await create(app)).json();
  const cases = [
    (value) => {
      value.title = '  ';
    },
    (value) => {
      value.groups = [];
    },
    (value) => {
      value.groups[0].steps = [''];
    },
    (value) => {
      value.groups[0].ingredients[0].quantity = 100;
    },
    (value) => {
      value.referenceId = 'missing';
    },
    (value) => {
      value.groups[1].ingredients[0].quantity = '0';
    },
    (value) => {
      value.groups[0].ingredients[0].id = 'butter';
    },
    (value) => {
      value.groups[0].ingredients[0].specialPercent = '1.6';
    },
    (value) => {
      value.groups[0].ingredients[0].componentId = 999;
    },
    (value) => {
      value.groups[0].ingredients[0].componentId = id;
    },
    (value) => {
      value.groups[0].ingredients[0].quantity = '-10';
    },
    (value) => {
      value.unexpected = 'field';
    },
    (value) => {
      value.categories = ['Sauces & condiments'];
    },
    (value) => {
      value.categories = ['Bread', 'Bread'];
    },
  ];
  for (const mutate of cases) {
    const payload = exampleRecipe();
    mutate(payload);
    const response = await app.inject({
      method: 'PUT',
      url: `/api/recipes/${id}`,
      payload,
    });
    assert.equal(response.statusCode, 400, response.body);
  }
  assert.deepEqual(
    (await app.inject(`/api/recipes/${id}`)).json().groups,
    exampleRecipe().groups,
  );
});

test('component links prevent deletion until the link is removed', async (t) => {
  const app = await setup(t);
  const component = (await create(app)).json();
  const input = exampleRecipe();
  input.title = 'Dish using sauce';
  input.groups[0].ingredients[0].componentId = component.id;
  const dish = (await create(app, input)).json();
  assert.match(
    (await app.inject(`/recipes/${dish.id}`)).body,
    new RegExp(`href="/recipes/${component.id}">Component:`),
  );
  const blocked = await app.inject({
    method: 'DELETE',
    url: `/api/recipes/${component.id}`,
  });
  assert.equal(blocked.statusCode, 409);
  assert.match(blocked.json().message, /Dish using sauce/);
  input.groups[0].ingredients[0].componentId = null;
  await app.inject({
    method: 'PUT',
    url: `/api/recipes/${dish.id}`,
    payload: input,
  });
  assert.equal(
    (
      await app.inject({
        method: 'DELETE',
        url: `/api/recipes/${component.id}`,
      })
    ).statusCode,
    204,
  );
});

test('rejects cross-origin writes while same-origin writes work', async (t) => {
  const app = await setup(t);
  const payload = exampleRecipe();
  const blocked = await app.inject({
    method: 'POST',
    url: '/api/recipes',
    payload,
    headers: { origin: 'https://other.example' },
  });
  assert.equal(blocked.statusCode, 403);
  const allowed = await app.inject({
    method: 'POST',
    url: '/api/recipes',
    payload,
    headers: { origin: 'http://localhost:80' },
  });
  assert.equal(allowed.statusCode, 201, allowed.body);
});

test('blank optional metadata and stages with no ingredients are supported', async (t) => {
  const app = await setup(t);
  const payload = {
    title: 'Rest the dough',
    yield: '',
    attribution: '',
    notes: '',
    referenceId: null,
    groups: [
      { id: 'rest', title: '', ingredients: [], steps: ['Rest for 30 min.'] },
    ],
  };
  const response = await create(app, payload);
  assert.equal(response.statusCode, 201);
  assert.match(
    (await app.inject(`/recipes/${response.json().id}`)).body,
    /Rest for <strong>30 min<\/strong>/,
  );
  assert.equal((await app.inject('/recipes/not-a-number')).statusCode, 404);
});
