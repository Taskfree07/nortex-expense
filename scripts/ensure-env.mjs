/**
 * Puts a .env in place on a fresh clone.
 *
 * .env is not committed - it is where an API key would sit - so a clone has
 * none, and Prisma stops on "Environment variable not found: DATABASE_URL"
 * before anything else runs. Copying the example across makes `npm run setup`
 * true as written: clone, install, run, with nothing else installed and nothing
 * to configure first.
 *
 * An existing .env is never touched.
 */

import { copyFile, access } from "fs/promises";
import path from "path";

const env = path.join(process.cwd(), ".env");
const example = path.join(process.cwd(), ".env.example");

try {
  await access(env);
  // Already there: leave whatever the developer has put in it alone.
} catch {
  try {
    await copyFile(example, env);
    console.log("Created .env from .env.example (SQLite file, no API key).");
  } catch (error) {
    console.error(
      `Could not create .env from .env.example: ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  }
}
