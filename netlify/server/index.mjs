import server from '../../server.js';

await server.init();
const app = server.buildApp();

export default app;
