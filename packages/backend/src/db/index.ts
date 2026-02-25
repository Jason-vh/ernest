import path from "path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { DATABASE_URL } from "@/config";
import * as schema from "./schema";

const client = postgres(DATABASE_URL);
export const db = drizzle(client, { schema });

export async function initDb() {
  await migrate(db, {
    migrationsFolder: path.resolve(import.meta.dir, "../../drizzle"),
  });
  console.log("Database migrations applied");
}
