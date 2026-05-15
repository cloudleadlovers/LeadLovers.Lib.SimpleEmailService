import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaClient } from '../generated/prisma/index.js';
import { EmailConfigError, Messages } from '../errors.js';
import { loadConfig } from '../config.js';

let client: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (client) return client;
  const cfg = loadConfig();
  let adapter: PrismaMssql;
  try {
    adapter = new PrismaMssql(cfg.DATABASE_URL);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new EmailConfigError(Messages.config.dbInvalid(reason));
  }
  client = new PrismaClient({ adapter });
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (!client) return;
  await client.$disconnect();
  client = undefined;
}

export function resetPrismaForTests(): void {
  client = undefined;
}
