import type { VercelRequest, VercelResponse } from '@vercel/node'

const API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const apiKey = process.env.ZHIPU_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'API Key not configured' })

  const upstream = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(req.body),
  })

  res.status(upstream.status)
  res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json')

  const reader = upstream.body?.getReader()
  if (!reader) return res.end()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    res.write(value)
  }
  res.end()
}
