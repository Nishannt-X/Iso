// The only module that reads process.env. Variable names are documented in README.md.
export interface Config {
  port: number;
  dbPath: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${env.PORT}"`);
  }
  return { port, dbPath: env.DB_PATH || 'data/kochi-tours.db' };
}
