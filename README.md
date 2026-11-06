# Artisanist

A Modernist Cuisine inspired personal recipe notebook.

## Run

```sh
mise install
mise exec -- npm ci
mise exec -- npm run dev
```

Open http://127.0.0.1:3000. The SQLite database is created and migrated automatically.

Copy `.env.example` to `.env` to change settings. Optionally run `npm run db:seed` to add an example recipe.

## Development

```sh
npm run format       # Format files
npm run check        # Check formatting and run unit/integration tests
npm run test:setup   # Install Chromium once
npm run test:e2e     # Run browser tests
```

Tests use isolated databases. Refresh the browser after front-end edits.

## Data

To back up or restore, stop the server, copy or replace `data/recipes.sqlite`, then restart.

Add schema changes as new SQL files in `migrations/`; never edit applied migrations. Back up before schema changes. Migrations run at startup or with `npm run db:migrate`.

## Deployment

Copy `.env.deploy.example` to `.env.deploy` and set `DEPLOY_HOST`.

```sh
mise exec -- npm run deploy:setup  # First deployment or service changes
mise exec -- npm run deploy        # Subsequent deployments
```
