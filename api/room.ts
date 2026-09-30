import { handleGet, handlePost } from '../server/handler.js'

// Vercel Function (Node.js runtime, Web-standard handlers). All game logic lives in server/.
export function GET(request: Request) {
  return handleGet(request)
}

export function POST(request: Request) {
  return handlePost(request)
}
