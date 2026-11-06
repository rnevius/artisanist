import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const migrationsPath = fileURLToPath(
  new URL('../migrations/', import.meta.url),
);

export function openDatabase(
  path = process.env.DATABASE_PATH || './data/recipes.sqlite',
) {
  if (path !== ':memory:')
    mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    db.exec(
      'CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)',
    );
    for (const name of readdirSync(migrationsPath)
      .filter((name) => /^\d+.*\.sql$/.test(name))
      .sort()) {
      const sql = readFileSync(resolve(migrationsPath, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      db.exec('BEGIN IMMEDIATE');
      try {
        const previous = db
          .prepare('SELECT checksum FROM migrations WHERE name = ?')
          .get(name);
        if (previous && previous.checksum !== checksum)
          throw new Error(`Applied migration changed: ${name}`);
        if (!previous) {
          db.exec(sql);
          db.prepare(
            'INSERT INTO migrations (name, checksum) VALUES (?, ?)',
          ).run(name, checksum);
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function fromRow(row) {
  return row
    ? {
        categories: [],
        ...JSON.parse(row.document),
        id: row.id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;
}

export function recipeStore(db) {
  return {
    list() {
      return db
        .prepare(
          'SELECT id, title, updated_at AS updatedAt FROM recipes ORDER BY title COLLATE NOCASE, id',
        )
        .all();
    },
    get(id) {
      return fromRow(db.prepare('SELECT * FROM recipes WHERE id = ?').get(id));
    },
    create(recipe) {
      const result = db
        .prepare('INSERT INTO recipes (title, document) VALUES (?, ?)')
        .run(
          recipe.title.trim(),
          JSON.stringify({ ...recipe, title: recipe.title.trim() }),
        );
      return this.get(Number(result.lastInsertRowid));
    },
    update(id, recipe) {
      db.prepare(
        "UPDATE recipes SET title = ?, document = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
      ).run(
        recipe.title.trim(),
        JSON.stringify({ ...recipe, title: recipe.title.trim() }),
        id,
      );
      return this.get(id);
    },
    references(id) {
      return db
        .prepare(
          `SELECT DISTINCT recipes.id, recipes.title FROM recipes, json_each(recipes.document, '$.groups') AS groups, json_each(groups.value, '$.ingredients') AS ingredients WHERE json_extract(ingredients.value, '$.componentId') = ?`,
        )
        .all(id);
    },
    delete(id) {
      return db.prepare('DELETE FROM recipes WHERE id = ?').run(id).changes > 0;
    },
  };
}
