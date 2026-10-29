import http from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import worker from '../worker/index.js';

// Reuse the production request handler so both hosts serve identical APIs/assets.
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 4096) {
        res.writeHead(413);
        res.end('Too large');
        return;
      }
      chunks.push(chunk);
    }
    const method = req.method || 'GET';
    const request = new Request(new URL(req.url, 'http://localhost'), {
      method,
      headers: req.headers,
      ...(!['GET', 'HEAD'].includes(method) ? { body: Buffer.concat(chunks) } : {}),
    });
    const response = await worker.fetch(request, {
      JAVA_RISK_ORIGIN: process.env.JAVA_RISK_ORIGIN,
    });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body && method !== 'HEAD') {
      await pipeline(Readable.fromWeb(response.body), res);
    } else res.end();
  } catch (error) {
    console.error('Request failed:', error.message);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});
server.listen(Number(process.env.PORT || 3000), '0.0.0.0');
process.on('SIGTERM', () => server.close(() => process.exit(0)));
