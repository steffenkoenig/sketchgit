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
 */
export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
