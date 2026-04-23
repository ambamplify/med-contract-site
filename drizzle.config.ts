import type { Config } from "drizzle-kit";

export default {
  schema: "./shared/schema.ts",
  out: "./drizzle",
  driver: "better-sqlite3",
  dbCredentials: {
    url: process.env.DATABASE_PATH || "./med-contract.db",
  },
} satisfies Config;
