import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Runs the Vercel functions in api/ during `npm run dev` so photo reading works locally too.
function devApi() {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use('/api/read-cards', async (req, res) => {
        let body = '';
        for await (const chunk of req) body += chunk;
        const out = {
          status(code) { res.statusCode = code; return out; },
          json(data) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(data)); },
        };
        try {
          const mod = await server.ssrLoadModule('/api/read-cards.js');
          await mod.default({ method: req.method, body: body ? JSON.parse(body) : {} }, out);
        } catch (err) {
          out.status(500).json({ error: String(err.message || err) });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
  server: { port: 5180 },
});
