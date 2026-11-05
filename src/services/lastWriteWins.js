import { lte, sql } from "drizzle-orm";

export function notNewerThan(table, clientTime) {
  return clientTime ? lte(table.updatedAt, clientTime) : undefined;
}

export function stamp(clientTime) {
  return clientTime ? { updatedAt: clientTime } : {};
}

export function deletionTime(clientTime) {
  return clientTime ?? new Date();
}

export function latestUpdate(table, clientTime) {
  return clientTime
    ? {
        updatedAt: sql`greatest(${table.updatedAt}, ${clientTime.toISOString()}::timestamptz)`,
      }
    : {};
}
