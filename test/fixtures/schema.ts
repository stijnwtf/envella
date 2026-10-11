import { port, str, url } from '../../src/index';

export const schema = {
  DATABASE_URL: url({ description: 'Postgres connection string' }),
  PORT: port({ default: 3000 }),
  API_KEY: str({ secret: true }),
};
