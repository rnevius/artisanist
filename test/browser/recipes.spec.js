import { test, expect } from '@playwright/test';

test('author, reorder, scale, edit, and delete a recipe', async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('link', { name: 'New recipe', exact: true }).click();
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.getByLabel('Recipe title').fill('Brown butter sauce');
  await page.getByLabel('Finished yield').fill('250 g');
  await page.getByRole('checkbox', { name: 'Sides', exact: true }).check();
  await page
    .getByRole('checkbox', { name: 'Pantry staples', exact: true })
    .check();
  let stage = page.locator('[data-group]').first();
  await stage.getByLabel('Stage name').fill('Brown the butter');
  let item = stage.locator('[data-ingredient]').first();
  await item.getByLabel('Ingredient', { exact: true }).fill('Butter');
  await item.getByLabel('Quantity', { exact: true }).fill('200');
  await stage
    .getByLabel('Step 1', { exact: true })
    .fill('Heat at 150 °C for 5–6 minutes until golden.');
  await stage
    .getByRole('button', { name: 'Add ingredient', exact: true })
    .click();
  item = stage.locator('[data-ingredient]').last();
  await item.getByLabel('Ingredient', { exact: true }).fill('Lemon juice');
  await item.getByLabel('Quantity', { exact: true }).fill('40');
  await page
    .getByLabel('100% reference ingredient (optional)')
    .selectOption({ label: 'Butter (200 g)' });
  await page
    .getByRole('button', { name: 'Add cooking stage', exact: true })
    .click();
  stage = page.locator('[data-group]').last();
  await stage.getByLabel('Stage name').fill('Finish');
  item = stage.locator('[data-ingredient]').first();
  await item.getByLabel('Ingredient', { exact: true }).fill('Salt');
  await item.getByLabel('Quantity', { exact: true }).fill('as needed');
  await item.getByLabel('Unit', { exact: true }).selectOption('');
  await stage.getByLabel('Step 1', { exact: true }).fill('Season and serve.');
  await stage.getByRole('button', { name: 'Add step', exact: true }).click();
  await stage.getByLabel('Step 2', { exact: true }).fill('Keep warm.');
  await stage
    .getByRole('button', { name: 'Move step 2 up', exact: true })
    .click();
  await page.screenshot({
    path: testInfo.outputPath('editor.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('editor-mobile.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
  await expect(page).toHaveURL(/\/recipes\/\d+$/);
  await expect(
    page.getByRole('heading', { name: 'Brown butter sauce' }),
  ).toBeVisible();
  await expect(page.getByText('20%', { exact: true })).toBeVisible();
  await expect(page.getByText('100%', { exact: true })).toBeVisible();
  await expect(page.locator('table strong')).toHaveText([
    '150 °C',
    '5–6 minutes',
  ]);
  await expect(page.locator('[data-categories]')).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('card.png'),
    fullPage: true,
  });
  await expect(page.locator('tbody').last().locator('li').first()).toHaveText(
    'Keep warm.',
  );
  await page.getByLabel('Batch size', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('[data-yield]')).toContainText('Yields 500 g');
  await expect(page.locator('[data-yield]')).toContainText(
    'Original yield: 250 g',
  );
  await expect(
    page.getByRole('cell', { name: '400 g', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('cell', { name: 'as needed', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /^(Half|Original|Double)$/ }),
  ).toHaveCount(0);
  await page.getByLabel('Butter amount', { exact: true }).fill('0.6');
  await page.getByLabel('Ingredient weight unit').selectOption('kg');
  await page
    .getByRole('button', { name: 'Scale by ingredient', exact: true })
    .click();
  await expect(page.getByLabel('Batch size', { exact: true })).toHaveValue('3');
  await expect(page.getByLabel('Butter amount', { exact: true })).toHaveValue(
    '0.6',
  );
  await expect(page.getByLabel('Ingredient weight unit')).toHaveValue('kg');
  await expect(
    page.getByRole('cell', { name: '600 g', exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-yield]')).toContainText('Yields 750 g');
  await page.screenshot({
    path: testInfo.outputPath('scaled-by-ingredient.png'),
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Edit recipe', exact: true }).click();
  await expect(
    page.getByLabel('100% reference ingredient (optional)'),
  ).not.toHaveValue('');
  await page.getByLabel('Recipe title').fill('Warm brown butter sauce');
  await expect(
    page.getByRole('checkbox', { name: 'Sides', exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Pantry staples', exact: true }),
  ).toBeChecked();
  await page.getByRole('checkbox', { name: 'Sides', exact: true }).uncheck();
  await page
    .getByRole('button', { name: 'Move stage 2 up', exact: true })
    .click();
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Warm brown butter sauce' }),
  ).toBeVisible();
  await expect(page.locator('tbody').first()).toHaveAttribute(
    'aria-label',
    'Finish',
  );
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('button', { name: 'Print / PDF' })).toBeHidden();
  await expect(page.locator('table')).toBeVisible();
  const printColumns = await page
    .locator('article table')
    .evaluate((table) => ({
      heading: table.tHead.rows[0].cells[3].getBoundingClientRect().left,
      cell: table.tBodies[0].rows[0].cells[3].getBoundingClientRect().left,
      step: table.tBodies[0].querySelector('li').getBoundingClientRect().left,
    }));
  expect(Math.abs(printColumns.cell - printColumns.heading)).toBeLessThan(1);
  expect(printColumns.step).toBeGreaterThan(printColumns.heading);
  await page.screenshot({
    path: testInfo.outputPath('print.png'),
    fullPage: true,
  });
  await page.emulateMedia({ media: 'screen' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('mobile.png'),
    fullPage: true,
  });
  await page.getByText('Delete recipe', { exact: true }).click();
  await page
    .getByRole('button', { name: 'Confirm deletion', exact: true })
    .click();
  await expect(page).toHaveURL('/');
  await expect(
    page.getByRole('link', { name: 'Warm brown butter sauce', exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('invalid scaling retains the draft and can be corrected', async ({
  page,
}) => {
  await page.goto('/recipes/new');
  await page.getByLabel('Recipe title').fill('Test draft');
  await page.getByLabel('Ingredient', { exact: true }).fill('Gelatin');
  await page.getByLabel('Quantity', { exact: true }).fill('1');
  await page.getByLabel('Step 1', { exact: true }).fill('Hydrate.');
  await page.getByText('Options', { exact: true }).click();
  await page.getByLabel('Special scaling (%)').fill('1.6');
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'explanation of its basis',
  );
  await expect(page.getByLabel('Recipe title')).toHaveValue('Test draft');
  await page.getByLabel('Percentage basis').fill('total liquid weight');
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Test draft' })).toBeVisible();
  await expect(
    page.getByText('Gelatin: 1.6% of total liquid weight.'),
  ).toBeVisible();
});
