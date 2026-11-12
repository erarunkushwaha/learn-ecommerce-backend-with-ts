import { readMysqlSettings, readRedisSettings } from "../dist/config/env.js";
import { checkMysqlConnection, checkRedisConnection } from "../dist/config/data-stores.js";

/**
 * One-shot connectivity check for the Compose MySQL and Redis services.
 * Does not start the HTTP server, write cache keys, or run migrations.
 */

let mysqlSettings;
let redisSettings;

try {
  mysqlSettings = readMysqlSettings(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Invalid MySQL settings");
  process.exitCode = 1;
}

try {
  redisSettings = readRedisSettings(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Invalid Redis settings");
  process.exitCode = 1;
}

if (mysqlSettings) {
  try {
    await checkMysqlConnection(mysqlSettings);
    console.log(
      `MySQL ok ${mysqlSettings.host}:${mysqlSettings.port}/${mysqlSettings.database} user ${mysqlSettings.user}`,
    );
  } catch (error) {
    console.error(
      `MySQL check failed: ${error instanceof Error ? error.message : "MySQL check failed"}`,
    );
    process.exitCode = 1;
  }
}

if (redisSettings) {
  try {
    await checkRedisConnection(redisSettings);
    console.log(`Redis ok ${redisSettings.host}:${redisSettings.port}`);
  } catch (error) {
    console.error(
      `Redis check failed: ${error instanceof Error ? error.message : "Redis check failed"}`,
    );
    process.exitCode = 1;
  }
}
