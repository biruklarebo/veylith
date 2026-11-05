import { defineConfig } from 'prisma/config';

// DATABASE_URL comes from compose.yaml. Generating the client doesn't need it.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
