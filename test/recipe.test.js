import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  grams,
  numericQuantity,
  scaledAmount,
  scaledQuantity,
  scaledYield,
  scalingPercent,
} from '../src/recipe.js';

test('ratios convert mass units and preserve a reference whose percentages exceed 100%', () => {
  const reference = { quantity: '250', unit: 'g' };
  assert.equal(
    scalingPercent({ quantity: '0.75', unit: 'kg' }, reference),
    '300%',
  );
  assert.equal(
    scalingPercent({ quantity: '2500', unit: 'mg' }, reference),
    '1%',
  );
  assert.equal(scalingPercent(reference, reference), '100%');
  assert.equal(scalingPercent({ quantity: '3', unit: 'eggs' }, reference), '—');
  assert.equal(scalingPercent(reference, null), '—');
  assert.equal(grams({ quantity: '1', unit: 'lb' }), 453.59237);
});

test('yield scaling handles weights, portions, combined yields, and estimates', () => {
  assert.equal(scaledYield('250 g', 2), '500 g');
  assert.equal(scaledYield('750 g / 4 portions', 0.5), '375 g / 2 portions');
  assert.equal(scaledYield('About 1,000 g', 1.5), 'About 1.5 kg');
  assert.equal(scaledYield('4–6 servings', 2), '8–12 servings');
  assert.equal(scaledYield('~1 L', 2), '~ 2 L');
  assert.equal(scaledYield('1 loaf (20 cm)', 2), null);
  assert.equal(scaledYield('one baking tray', 2), null);
  assert.equal(scaledYield('', 2), null);
  assert.equal(scaledYield('1 loaf (20 cm)', 1), '1 loaf (20 cm)');
});

test('yield scaling distinguishes fractions from combined yields', () => {
  assert.equal(scaledYield('1/2 cup', 2), '1 cup');
  assert.equal(scaledYield('1 / 2 cup', 3), '1 1/2 cups');
  assert.equal(scaledYield('1 1/2 cups', 2), '3 cups');
  assert.equal(
    scaledYield('About 1/2 cup / 2 portions', 2),
    'About 1 cup / 4 portions',
  );
  assert.equal(scaledYield('750 g/4 portions', 2), '1.5 kg / 8 portions');
  assert.equal(scaledYield('1/2–3/4 cup', 2), '1 cup–1 1/2 cups');
  assert.equal(scaledYield('1 Tbsp', '1/3'), '1 tsp');
  assert.equal(scaledYield('1/0 cup', 2), null);
  assert.equal(scaledYield('1/2/3 cup', 2), null);
  assert.equal(scaledYield('1/2 cup / one tray', 2), null);
});

test('fractional ingredients scale with practical spoon units and weight ratios', () => {
  assert.equal(scaledQuantity('1 1/2', 2), '3');
  assert.equal(scaledAmount('1/3', 'Tbsp', 1), '1 tsp');
  assert.equal(scaledAmount('1/2', 'tbsp', 0.5), '3/4 tsp');
  assert.equal(scaledAmount('1/2', 'tbsp', 2), '1 tbsp');
  assert.equal(scaledAmount('1/2', 'cup', 2), '1 cup');
  assert.equal(
    scaledAmount('as needed', 'custom unit', 2),
    'as needed custom unit',
  );
  assert.equal(grams({ quantity: '1/2', unit: 'kg' }), 500);
  assert.equal(numericQuantity('1 / 3'), 1 / 3);
  assert.equal(numericQuantity('1/0'), null);
  assert.equal(numericQuantity('1/2/3'), null);
  assert.equal(numericQuantity('1/-2'), null);
});

test('cup measures keep familiar fractions and convert other remainders to spoons', () => {
  for (const fraction of ['1/4', '1/3', '1/2', '2/3', '3/4']) {
    assert.equal(scaledAmount(fraction, 'cups'), `${fraction} cup`);
    assert.equal(scaledAmount(`2 ${fraction}`, 'cup'), `2 ${fraction} cups`);
  }
  assert.equal(scaledAmount('1/8', 'cup'), '2 tbsp');
  assert.equal(scaledAmount('0.375', 'Cups'), '6 tbsp');
  assert.equal(scaledAmount('1 3/8', 'cups'), '1 cup + 6 tbsp');
  assert.equal(scaledAmount('2 1/8', 'cup'), '2 cups + 2 tbsp');
  assert.equal(scaledAmount('1/16', 'cup'), '1 tbsp');
  assert.equal(scaledAmount('1/48', 'cup'), '1 tsp');
  assert.equal(scaledAmount('1', 'cup', 1.375), '1 cup + 6 tbsp');
  assert.equal(scaledAmount('3/8', 'cup', 2), '3/4 cup');
  assert.equal(scaledAmount('1/3', 'cup', 7), '2 1/3 cups');
  assert.equal(scaledAmount('0.1', 'cup', 10), '1 cup');
  assert.equal(scaledAmount('0.00000001', 'cup'), '0.00000048 tsp');
  assert.equal(scaledAmount('as needed', 'cups', 2), 'as needed cups');
  assert.equal(scaledYield('1/8 cup'), '2 tbsp');
  assert.equal(scaledYield('1 cup', 1.375), '1 cup + 6 tbsp');
  assert.equal(scaledYield('1/8 cup / 2 portions', 3), '6 tbsp / 6 portions');
});

test('spoon measures promote to tablespoons and familiar cups and show readable fractions', () => {
  const examples = [
    ['3', 'tsp', '1 tbsp'],
    ['4', 'tsp', '1 tbsp + 1 tsp'],
    ['12', 'tsp', '1/4 cup'],
    ['16', 'tsp', '1/3 cup'],
    ['4', 'tbsp', '1/4 cup'],
    ['8', 'tbsp', '1/2 cup'],
    ['16', 'tbsp', '1 cup'],
    ['20', 'tbsp', '1 1/4 cups'],
    ['22', 'tbsp', '1 cup + 6 tbsp'],
    ['0.5', 'tsp', '1/2 tsp'],
    ['0.125', 'tsp', '1/8 tsp'],
    ['1.5', 'tbsp', '1 tbsp + 1 1/2 tsp'],
  ];
  for (const [quantity, unit, expected] of examples)
    assert.equal(scaledAmount(quantity, unit), expected);
  assert.equal(scaledYield('4 tsp', 2), '2 tbsp + 2 tsp');
  assert.equal(scaledYield('1–2 tbsp', 0.5), '1 1/2 tsp–1 tbsp');
});

test('metric measures choose readable units within their original dimension', () => {
  const examples = [
    ['0.25', 'kg', '250 g'],
    ['1000', 'g', '1 kg'],
    ['1500', 'grams', '1.5 kg'],
    ['0.25', 'g', '250 mg'],
    ['1000', 'mg', '1 g'],
    ['0.5', 'mg', '0.5 mg'],
    ['0.25', 'L', '250 ml'],
    ['1000', 'ml', '1 L'],
    ['1500', 'ml', '1.5 L'],
    ['0.5', 'litres', '500 ml'],
    ['20', 'oz', '20 oz'],
    ['1', 'lb', '1 lb'],
  ];
  for (const [quantity, unit, expected] of examples)
    assert.equal(scaledAmount(quantity, unit), expected);
  assert.equal(scaledAmount('0.25', 'kg', 4), '1 kg');
  assert.equal(scaledYield('500 ml', 2), '1 L');
  assert.equal(scaledYield('0.49–0.51 L', 2), '980 ml–1.02 L');
});

test('conversions retain arbitrary decimals and fractions without rounding to measures', () => {
  assert.equal(scaledAmount('0.17', 'tbsp'), '0.51 tsp');
  assert.equal(scaledAmount('1.17', 'tbsp'), '1 tbsp + 0.51 tsp');
  assert.equal(scaledAmount('0.49999', 'tsp'), '0.49999 tsp');
  assert.equal(
    scaledAmount('0.33333333333333333333', 'tsp'),
    '0.33333333333333333333 tsp',
  );
  assert.equal(scaledAmount('1.0000000001', 'g'), '1.0000000001 g');
  assert.equal(scaledAmount('0.1', 'g', 0.1), '10 mg');
  assert.equal(
    scaledAmount('0.1234567890123456789', 'kg'),
    '123.4567890123456789 g',
  );
  assert.equal(scaledAmount('1/7', 'tsp'), '1/7 tsp');
  assert.equal(scaledAmount('1/7', 'cup'), '2 tbsp + 6/7 tsp');
  assert.equal(scaledAmount('1/7', 'kg'), '142 6/7 g');
  assert.equal(scaledYield('1/3 cup', 7), '2 1/3 cups');
  assert.equal(
    scaledYield('0.33333333333333333333 tsp', 2),
    '0.66666666666666666666 tsp',
  );
  assert.equal(scaledAmount('0', 'tsp', 2), '0 tsp');
  assert.equal(scaledAmount('as needed', 'ml', 2), 'as needed ml');
  assert.equal(scaledAmount('1/3', 'custom unit', 2), '2/3 custom unit');
});

test('scaling preserves qualitative amounts and enough precision for small additions', () => {
  assert.equal(scaledQuantity('0.01', 0.1), '0.001');
  assert.equal(scaledQuantity('0.0001', 0.001), '0.0000001');
  assert.equal(scaledQuantity('as needed', 3), 'as needed');
  assert.equal(scaledQuantity('', 3), '');
  assert.equal(scaledQuantity('2', 1.5), '3');
  assert.equal(numericQuantity('1/2'), 0.5);
  assert.equal(numericQuantity('10 g'), null);
  assert.equal(numericQuantity('.5'), 0.5);
});
