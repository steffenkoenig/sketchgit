import { defineConfig } from '@prisma/config';

/**
 * Prisma v7 configuration.
 *
 * In Prisma 7, the `url` property was removed from the `datasource` block in
 * `schema.prisma`.  Connection URLs for Migrate commands must now be supplied
 * here via `prisma.config.ts`.  The PrismaClient constructor receives the URL
 * through its own adapter/environment resolution path.
 *
 * @see https://pris.ly/d/config-datasource
 *
 * P060 – When PgBouncer sits in front of PostgreSQL (transaction-mode
 * pooling), `migrate`/introspection commands need a direct, session-scoped
 * connection instead — transaction-mode pooling doesn't support the
 * multi-statement sessions those commands issue. DATABASE_DIRECT_URL should
 * point straight at PostgreSQL, bypassing PgBouncer. When unset (no
 * PgBouncer in the deployment), it falls back to DATABASE_URL as before.
 */
export default defineConfig({
  datasource: {
    url: process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
