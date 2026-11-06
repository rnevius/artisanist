import { createApp } from './app.js';

const app = createApp({ logger: true });
const close = async () => {
  await app.close();
};
process.once('SIGINT', close);
process.once('SIGTERM', close);

try {
  await app.listen({
    port: Number(process.env.PORT || 3000),
    host: process.env.HOST || '127.0.0.1',
  });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
