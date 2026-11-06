# Repository Guidelines

## Project Structure & Module Organization

Artisanist is a personal recipe notebook using Node.js ES modules, Fastify, and SQLite. This is not a public product, so the codebase is small and simple. Don't overcomplicate it.

The inspiration for the recipe card design is Modernist Cuisine. 

## Build, Test, and Development Commands

Use Node.js, pinned in `mise.toml`. Run `mise install`, then prefix npm commands with `mise exec --` if needed.

- `npm ci`: install dependencies from the lockfile.
- `npm run dev`: start the watch-mode server at `http://127.0.0.1:3000`; refresh the browser after frontend edits.
- `npm start`: run the server without watch mode. There is no build step.
- `npm run db:migrate`: apply migrations; startup also applies them automatically.
- `npm run db:seed`: add an example recipe.
- `npm run check`: check formatting and run unit/integration tests.
- `npm run test:setup`: install Chromium for browser tests.
- `npm run test:e2e`: run Playwright scenarios against a temporary database on port 3100.

## Coding Style & Naming Conventions

Use two-space indentation, semicolons, single quotes, and trailing commas. Run `npm run format` to apply Prettier. Use camelCase for functions and variables, descriptive lowercase module filenames, and explicit `.js` extensions in imports. Keep shared recipe rules in `src/recipe.js` so server and browser behavior stay aligned.

Use classless CSS and semantic HTML as the styling foundation. Favor readable typography, restrained styling, and usable recipe tables and forms.

## Testing Guidelines

Use `node:test` and `node:assert/strict` in `test/*.test.js`; use Playwright in `test/browser/*.spec.js`. Name tests after observable behavior. Reuse `test/fixtures.js` and isolate databases in memory or temporary directories. Cover validation, persistence, scaling, and affected browser workflows. No numeric coverage threshold is configured. Both `npm run check` and `npm run test:e2e` must pass in CI.

## Configuration & Data Safety

Copy `.env.example` to `.env` for `HOST`, `PORT`, and `DATABASE_PATH`. Keep the default loopback host: the app has no login. Add numbered SQL migrations such as `002-description.sql`; never edit applied migrations. Stop the server and back up `data/recipes.sqlite` before schema changes.
