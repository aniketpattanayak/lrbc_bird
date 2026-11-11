import 'dotenv/config';
import { buildApp } from './src/app';

const start = async () => {
  const app = await buildApp();
  const port = Number(process.env['PORT'] ?? process.env['API_PORT'] ?? 3001);
  await app.listen({ port, host: '0.0.0.0' });
};

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
