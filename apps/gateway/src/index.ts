import { email } from '@leadlovers/simple-email-service';
import { createFetch } from './server.js';

const PORT = Number(process.env.PORT ?? 8787);

const fetch = createFetch({
  email,
  gatewayApiKey: process.env.GATEWAY_API_KEY,
});

const server = Bun.serve({ port: PORT, fetch });

console.log(`email gateway listening on http://localhost:${server.port}`);

const shutdown = async (): Promise<void> => {
  console.log('shutting down...');
  server.stop();
  await email.disconnect();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
