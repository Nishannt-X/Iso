import { Hono } from 'hono';
import { get, type DatabaseSync } from './db/db.js';
import { listLiveVersions, type PackageVersion } from './domain/packages.js';

// Thin vertical slice (S0+S1): a plain, unstyled list of live packages. Design, detail pages,
// pricing display and the enquiry flow arrive in later slices. JSX output is escaped by Hono.

function Home({ packages }: { packages: PackageVersion[] }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Kochi Tours</title>
      </head>
      <body>
        <main>
          <h1>Kochi Tours</h1>
          <p>
            Early build: a plain list of published packages. PKG-KL-07 carries facts from the client brief; the
            rest, including all itinerary text, is synthetic demo data. Prices are not displayed yet.
          </p>
          {packages.length === 0 ? (
            <p>No packages are published yet.</p>
          ) : (
            <ul>
              {packages.map((p) => (
                <li>
                  <strong>{p.packageCode}</strong> {p.title} ({p.days} days / {p.nights} nights, {p.region})
                </li>
              ))}
            </ul>
          )}
        </main>
      </body>
    </html>
  );
}

export function createApp(db: DatabaseSync): Hono {
  const app = new Hono();

  app.get('/healthz', (c) => {
    try {
      get(db, 'SELECT 1 AS ok');
      return c.json({ status: 'ok' });
    } catch (err) {
      console.error('healthz: database check failed:', err instanceof Error ? err.message : err);
      return c.json({ status: 'error' }, 503);
    }
  });

  app.get('/', (c) => c.html(`<!DOCTYPE html>${(<Home packages={listLiveVersions(db)} />).toString()}`));

  app.onError((err, c) => {
    console.error('unhandled error:', err instanceof Error ? err.message : err);
    return c.text('Something went wrong. Please try again.', 500);
  });

  return app;
}
