import "dotenv/config";
import { startServer } from "./server/app";
import { logEvent } from "./server/telemetry";

void startServer().catch((error) => {
  logEvent("error", "server_start_failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
