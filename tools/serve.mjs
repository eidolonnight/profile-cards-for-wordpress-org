import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { GET as card } from '../functions/card.js';
import { GET as json } from '../functions/json.js';
import { GET as events } from '../functions/events.js';
import { GET as previewData } from '../functions/preview-data.js';
// Loopback-only development adapter. Real Functions exports are invoked unchanged.
const files = new Map([['/', ['index.html', 'text/html']], ['/create', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/THIRD-PARTY-NOTICES.txt', ['THIRD-PARTY-NOTICES.txt', 'text/plain']], ['/FONT-LICENSES.txt', ['FONT-LICENSES.txt', 'text/plain']], ['/styles.css', ['styles.css', 'text/css']]]);
const root = fileURLToPath(new URL('../public/', import.meta.url));
files.set('/background.js', ['background.js', 'text/javascript']);
files.set('/theme.js', ['theme.js', 'text/javascript']);
// Public modules are an exact allowlist, never a filesystem path from the URL.
const shared = new Map(['preview.js', 'options.js', 'svg.js', 'social.js', 'fonts.js', 'events.js', 'event-themes.js', 'event-fonts.js'].map(name => [`/preview/${name}`, new URL(`../shared/${name}`, import.meta.url)]));
const port = Number(process.env.PORT || 4197);
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    let response;
    if (['/json', '/card', '/events', '/preview-data'].includes(url.pathname)) response = await ({ '/json': json, '/card': card, '/events': events, '/preview-data': previewData }[url.pathname])(new Request(url, { method: 'GET' }));
    else if (url.pathname === '/LICENSE') response = new Response(await readFile(new URL('../LICENSE', import.meta.url)), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' } });
    else if (shared.has(url.pathname)) response = new Response(await readFile(shared.get(url.pathname)), { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' } });
    else if (files.has(url.pathname)) {
      const [file, type] = files.get(url.pathname);
      response = new Response(await readFile(root + file), { headers: { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' } });
    } else response = new Response('Not found', { status: 404 });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(req.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500).end('Local preview unavailable.'); }
}).listen(port, '127.0.0.1', () => console.log(`Profile Cards for WordPress.org: http://127.0.0.1:${port}`));
