import { createServer } from 'node:http'
import { handleGet, handlePost } from './handler.js'

/**
 * Local stand-in for Vercel: serves /api/room with the exact same handler code,
 * backed by in-memory storage (or Upstash, if its env vars are set). Vite proxies
 * /api here during `npm run dev`.
 */
const PORT = Number(process.env.API_PORT ?? 8787)

createServer(async (req, res) => {
  const url = `http://${req.headers.host}${req.url}`
  if (!req.url?.startsWith('/api/room')) {
    res.writeHead(404).end()
    return
  }
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const request = new Request(url, { method: req.method, headers: req.headers as Record<string, string>, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined })
  const response = req.method === 'POST' ? await handlePost(request) : await handleGet(request)
  res.writeHead(response.status, Object.fromEntries(response.headers))
  res.end(await response.text())
}).listen(PORT, () => console.log(`Major–Minor API (local) on http://localhost:${PORT}/api/room`))
