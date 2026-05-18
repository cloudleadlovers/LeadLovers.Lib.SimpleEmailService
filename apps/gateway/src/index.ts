import { email } from '@leadlovers/simple-email-service';
import { createFetch } from './server.js';
import { consoleLogger } from './logger.js';

const PORT = Number(process.env.PORT ?? 8787);

email.setLogger(consoleLogger);

const fetch = createFetch({
  email,
  gatewayApiKey: process.env.GATEWAY_API_KEY,
  logger: consoleLogger,
});

const server = Bun.serve({ port: PORT, fetch });

consoleLogger.info('email gateway listening', { port: server.port });

const shutdown = async (): Promise<void> => {
  consoleLogger.info('shutting down');
  server.stop();
  await email.disconnect();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
