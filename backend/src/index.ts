import { buildApp } from "./app";
import { config } from "./config";
import { scheduleBackups } from "./backup";
import { restoreScheduledRestart } from "./restart";

const app = await buildApp();
scheduleBackups();
restoreScheduledRestart();

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await app.listen({ host: config.host, port: config.port });

