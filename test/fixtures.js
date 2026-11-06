export function exampleRecipe() {
  const ingredient = (id, name, quantity, unit = 'g') => ({
    id,
    name,
    quantity,
    unit,
    specialPercent: '',
    specialBasis: '',
    componentId: null,
  });
  return {
    title: 'Test sauce',
    yield: '275 g',
    attribution: 'Kitchen notebook',
    notes: 'Serve warm.\nWhisk before serving.',
    referenceId: 'butter',
    groups: [
      {
        id: 'base',
        title: 'Reduce',
        ingredients: [
          ingredient('wine', 'White wine', '0.1', 'kg'),
          ingredient('shallot', 'Shallot', '25'),
        ],
        steps: ['Combine the wine and shallot.', 'Reduce to 20 g and strain.'],
      },
      {
        id: 'emulsion',
        title: 'Emulsify',
        ingredients: [
          ingredient('butter', 'Butter', '200'),
          ingredient('salt', 'Salt', 'as needed', ''),
        ],
        steps: ['Whisk in the butter at 60 °C / 140 °F.', 'Season with salt.'],
      },
    ],
  };
}
