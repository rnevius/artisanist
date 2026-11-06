const shortText = { type: 'string', maxLength: 200 };
const longText = { type: 'string', maxLength: 10000 };

export const recipeCategories = [
  'Mains',
  'Sides',
  'Desserts',
  'Bread',
  'Pastries',
  'Cheese & dairy',
  'Charcuterie',
  'Fermentations',
  'Pantry staples',
];

export const cookingUnits = [
  { label: 'Weight', units: ['g', 'kg', 'mg', 'oz', 'lb'] },
  {
    label: 'Volume',
    units: ['ml', 'L', 'tsp', 'tbsp', 'cup', 'fl oz', 'pt', 'qt', 'gal'],
  },
  {
    label: 'Count / small amounts',
    units: ['piece', 'clove', 'slice', 'dozen', 'pinch', 'dash'],
  },
];

export const recipeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'yield', 'attribution', 'notes', 'referenceId', 'groups'],
  properties: {
    title: { ...shortText, minLength: 1, pattern: '\\S' },
    yield: shortText,
    attribution: shortText,
    notes: longText,
    categories: {
      type: 'array',
      items: { type: 'string', enum: recipeCategories },
      uniqueItems: true,
      maxItems: recipeCategories.length,
      default: [],
    },
    referenceId: {
      anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }],
    },
    groups: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'ingredients', 'steps'],
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 100 },
          title: shortText,
          ingredients: {
            type: 'array',
            maxItems: 100,
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'id',
                'name',
                'quantity',
                'unit',
                'specialPercent',
                'specialBasis',
                'componentId',
              ],
              properties: {
                id: { type: 'string', minLength: 1, maxLength: 100 },
                name: { ...shortText, minLength: 1, pattern: '\\S' },
                quantity: { type: 'string', maxLength: 80 },
                unit: { type: 'string', maxLength: 40 },
                specialPercent: { type: 'string', maxLength: 40 },
                specialBasis: shortText,
                componentId: {
                  anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }],
                },
              },
            },
          },
          steps: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: { ...longText, minLength: 1, pattern: '\\S' },
          },
        },
      },
    },
  },
};

export function numericQuantity(value) {
  if (typeof value === 'number')
    return Number.isFinite(value) && value >= 0 ? value : null;
  const text = String(value).trim();
  if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return Number(text);
  const fraction = text.match(/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/);
  if (!fraction || Number(fraction[3]) === 0) return null;
  const number =
    Number(fraction[1] || 0) + Number(fraction[2]) / Number(fraction[3]);
  return Number.isFinite(number) ? number : null;
}

export function grams(ingredient) {
  const factors = {
    g: 1,
    kg: 1000,
    mg: 0.001,
    oz: 28.349523125,
    lb: 453.59237,
  };
  const quantity = numericQuantity(ingredient.quantity);
  const unit = ingredient.unit.trim().toLowerCase();
  const factor = Object.hasOwn(factors, unit) ? factors[unit] : null;
  return quantity !== null && factor ? quantity * factor : null;
}

export function formatNumber(value) {
  return new Intl.NumberFormat('en', { maximumSignificantDigits: 10 }).format(
    value,
  );
}

export function scaledQuantity(quantity, scale = 1) {
  const value = numericQuantity(quantity);
  return value === null ? quantity : formatNumber(value * scale);
}

// Exact ratios keep decimal and fractional measurements intact during conversion.
function ratio(numerator, denominator = 1n) {
  let a = numerator;
  let b = denominator;
  while (b) [a, b] = [b, a % b];
  return [numerator / a, denominator / a];
}

function quantityRatio(value) {
  const text = String(value).trim();
  const fraction = text.match(/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const denominator = BigInt(fraction[3]);
    return ratio(
      BigInt(fraction[1] || 0) * denominator + BigInt(fraction[2]),
      denominator,
    );
  }
  const [decimal, exponent = '0'] = text.toLowerCase().split('e');
  const [whole, fractional = ''] = decimal.split('.');
  const places = fractional.length - Number(exponent);
  const numerator = BigInt(`${whole || '0'}${fractional}`);
  return places >= 0
    ? ratio(numerator, 10n ** BigInt(places))
    : ratio(numerator * 10n ** BigInt(-places));
}

function multiplyRatio([numerator, denominator], [factor, divisor]) {
  return ratio(numerator * factor, denominator * divisor);
}

function formatRatio([numerator, denominator], spoon = false) {
  const whole = numerator / denominator;
  let remainder = numerator % denominator;
  const integer = whole.toLocaleString('en');
  if (!remainder) return integer;
  const fraction = `${whole ? `${integer} ` : ''}${remainder}/${denominator}`;
  if (spoon && [2n, 3n, 4n, 8n].includes(denominator)) return fraction;
  let divisor = denominator;
  for (const prime of [2n, 5n]) while (divisor % prime === 0n) divisor /= prime;
  // Repeating decimals stay fractions, rather than being rounded for display.
  if (divisor !== 1n) return fraction;
  let decimal = '';
  while (remainder) {
    remainder *= 10n;
    decimal += remainder / denominator;
    remainder %= denominator;
  }
  return `${integer}.${decimal}`;
}

function formatVolume(amount, unit) {
  // One cup = 16 tablespoons = 48 teaspoons. No conversion to metric volume.
  const cups = multiplyRatio(amount, [
    1n,
    unit === 'tsp' ? 48n : unit === 'tbsp' ? 16n : 1n,
  ]);
  const [numerator, denominator] = cups;
  if ([1n, 2n, 3n, 4n].includes(denominator))
    return `${formatRatio(cups, true)} ${numerator > denominator ? 'cups' : 'cup'}`;
  const whole = numerator / denominator;
  const tablespoons = ratio((numerator % denominator) * 16n, denominator);
  const spoonfuls = tablespoons[0] / tablespoons[1];
  const teaspoons = ratio(
    (tablespoons[0] % tablespoons[1]) * 3n,
    tablespoons[1],
  );
  return [
    whole
      ? `${whole.toLocaleString('en')} ${whole === 1n ? 'cup' : 'cups'}`
      : '',
    spoonfuls ? `${spoonfuls.toLocaleString('en')} tbsp` : '',
    teaspoons[0] ? `${formatRatio(teaspoons, true)} tsp` : '',
  ]
    .filter(Boolean)
    .join(' + ');
}

function formatMetric(amount, unit) {
  const mass = { mg: 1n, g: 1000n, gram: 1000n, grams: 1000n, kg: 1000000n };
  const volume = {
    ml: 1n,
    l: 1000n,
    litre: 1000n,
    litres: 1000n,
    liter: 1000n,
    liters: 1000n,
  };
  const units = Object.hasOwn(mass, unit) ? mass : volume;
  if (!Object.hasOwn(units, unit)) return null;
  const base = multiplyRatio(amount, [units[unit], 1n]);
  const choices =
    units === mass
      ? [
          ['kg', 1000000n],
          ['g', 1000n],
          ['mg', 1n],
        ]
      : [
          ['L', 1000n],
          ['ml', 1n],
        ];
  const [label, factor] =
    choices.find(([, size]) => base[0] >= base[1] * size) || choices.at(-1);
  return `${formatRatio(multiplyRatio(base, [1n, factor]))} ${label}`;
}

export function scaledAmount(quantity, unit, scale = 1) {
  const value = numericQuantity(quantity);
  const multiplier = numericQuantity(scale);
  if (
    value !== null &&
    value > 0 &&
    multiplier > 0 &&
    Number.isFinite(value * multiplier)
  ) {
    const amount = multiplyRatio(quantityRatio(quantity), quantityRatio(scale));
    const normalized = unit.trim().toLowerCase();
    if (['cup', 'cups', 'tbsp', 'tsp'].includes(normalized))
      return formatVolume(amount, normalized);
    const metric = formatMetric(amount, normalized);
    if (metric) return metric;
    return `${formatRatio(amount)}${unit ? ` ${unit}` : ''}`;
  }
  return `${scaledQuantity(quantity, scale)}${unit ? ` ${unit}` : ''}`;
}

// Only scale complete quantity/unit expressions, never dimensions or prose.
export function scaledYield(value, scale = 1) {
  if (!value.trim()) return null;
  const units = new Set([
    '',
    ...cookingUnits.flatMap((group) =>
      group.units.map((unit) => unit.toLowerCase()),
    ),
    'cups',
    'pieces',
    'cloves',
    'slices',
    'pinches',
    'dashes',
    'serving',
    'servings',
    'portion',
    'portions',
    'loaf',
    'loaves',
    'roll',
    'rolls',
    'cookie',
    'cookies',
    'muffin',
    'muffins',
    'jar',
    'jars',
    'litre',
    'litres',
    'liter',
    'liters',
    'gram',
    'grams',
  ]);
  const results = [];
  const amount = String.raw`(?:(?:\d+\s+)?\d+\s*\/\s*\d+|\d+(?:,\d{3})*(?:\.\d+)?|\.\d+)`;
  const expression = new RegExp(
    String.raw`^(?:(about|approximately|approx\.|~)\s*)?(${amount})(?:\s*([–-])\s*(${amount}))?\s*([a-z ]*)$`,
    'i',
  );
  // A yield separator follows a unit; slashes between numbers belong to fractions.
  for (const part of value.split(/(?<=[a-z])\s*\/\s*/i)) {
    const match = part.trim().match(expression);
    if (!match || !units.has(match[5].trim().toLowerCase()))
      return scale === 1 ? value : null;
    const low = match[2].replaceAll(',', '');
    const high = match[4]?.replaceAll(',', '');
    if (
      numericQuantity(low) === null ||
      (high && numericQuantity(high) === null)
    )
      return scale === 1 ? value : null;
    const unit = match[5].trim();
    const start = scaledAmount(low, unit, scale);
    let scaled = start;
    if (high) {
      const end = scaledAmount(high, unit, scale);
      const startParts = start.match(/^(.*) ([a-z]+)$/i);
      const endParts = end.match(/^(.*) ([a-z]+)$/i);
      scaled =
        startParts &&
        endParts &&
        startParts[2] === endParts[2] &&
        !start.includes(' + ') &&
        !end.includes(' + ')
          ? `${startParts[1]}${match[3]}${end}`
          : `${start}${match[3]}${end}`;
    }
    results.push(`${match[1] ? `${match[1]} ` : ''}${scaled}`);
  }
  return results.join(' / ');
}

export function scalingPercent(ingredient, reference) {
  const weight = grams(ingredient);
  const base = reference && grams(reference);
  return weight !== null && base > 0
    ? `${formatNumber((weight / base) * 100)}%`
    : '—';
}

export function scaleByReference(reference, quantity, unit) {
  const original = reference && grams(reference);
  const target = grams({ quantity, unit });
  const factor = original > 0 && target > 0 ? target / original : null;
  return Number.isFinite(factor) ? factor : null;
}

// Structural validation is handled by Fastify; these checks cover relationships.
export function validateRecipe(recipe) {
  const ingredients = recipe.groups.flatMap((group) => group.ingredients);
  const ids = [...recipe.groups, ...ingredients].map((item) => item.id);
  if (new Set(ids).size !== ids.length)
    return 'Group and ingredient identifiers must be unique.';
  if (recipe.referenceId !== null) {
    const reference = ingredients.find(
      (item) => item.id === recipe.referenceId,
    );
    if (!reference || !(grams(reference) > 0)) {
      return 'The 100% reference must be an ingredient with a positive weight in g, kg, mg, oz, or lb.';
    }
  }
  for (const ingredient of ingredients) {
    if (ingredient.specialPercent.trim()) {
      if (
        numericQuantity(ingredient.specialPercent) === null ||
        !ingredient.specialBasis.trim()
      ) {
        return 'Special scaling needs a non-negative percentage and an explanation of its basis.';
      }
    }
    if (/^-(?:\d|\.\d)/.test(ingredient.quantity.trim()))
      return 'Ingredient quantities cannot be negative.';
  }
  return null;
}
