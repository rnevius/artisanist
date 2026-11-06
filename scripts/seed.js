import { openDatabase, recipeStore } from '../src/db.js';

const db = openDatabase();
try {
  const store = recipeStore(db);
  const title = 'Lemon vinaigrette';
  if (store.list().some((recipe) => recipe.title === title)) {
    console.log('Example recipe already exists; nothing changed.');
  } else {
    const item = (id, name, quantity, unit = 'g') => ({
      id,
      name,
      quantity,
      unit,
      specialPercent: '',
      specialBasis: '',
      componentId: null,
    });
    const recipe = store.create({
      title,
      yield: 'About 160 g',
      attribution: 'An example recipe for your notebook',
      referenceId: 'oil',
      notes:
        'Whisk again before serving. The finished yield is an estimate; it is independent of the ingredient totals.',
      groups: [
        {
          id: 'acid-stage',
          title: 'Prepare the dressing base',
          ingredients: [
            item('lemon', 'Lemon juice', '40'),
            item('mustard', 'Dijon mustard', '10'),
            item('salt', 'Fine salt', '2'),
          ],
          steps: [
            'Whisk the lemon juice, mustard, and salt together in a bowl.',
          ],
        },
        {
          id: 'oil-stage',
          title: 'Emulsify',
          ingredients: [
            item('oil', 'Olive oil', '120'),
            item('pepper', 'Black pepper', 'as needed', ''),
          ],
          steps: [
            'Slowly pour the oil into the dressing base, whisking continuously until emulsified.',
            'Taste and adjust the seasoning with black pepper.',
          ],
        },
      ],
    });
    console.log(`Created example recipe: /recipes/${recipe.id}`);
  }
} finally {
  db.close();
}
