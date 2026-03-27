import { app } from "./app";
import { connectDatabase } from "./config/database";
import { env } from "./config/env";

async function bootstrap(): Promise<void> {
  await connectDatabase();

  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on port ${env.port}`);
  });
}

bootstrap().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server", error);
  process.exit(1);
});
