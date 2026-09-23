import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const connectionString = process.env.DATABASE_URL!;

// Local Postgres speaks plain TCP; hosted Postgres (Supabase) requires TLS.
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);

function createClient() {
  const adapter = new PrismaPg({
    connectionString,
    // Supabase's session pooler only allows a handful of connections in total
    // (its "pool size", 10 by default) and counts every open one. A small pool
    // that gives idle connections back keeps this app well inside that limit.
    max: 4,
    idleTimeoutMillis: 10_000,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  });
  return new PrismaClient({ adapter });
}

// In development the server reloads this file whenever code changes. Without
// this cache every reload would open a brand-new pool and leave the old one
// holding its connections until the pooler's limit is used up.
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
