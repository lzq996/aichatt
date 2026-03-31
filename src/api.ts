import type { Message } from './types'

const MODEL = import.meta.env.VITE_ZHIPU_MODEL ?? 'glm-4'
// 有代理时走代理，否则直连（本地开发用）
const USE_PROXY = import.meta.env.VITE_USE_PROXY === 'true'
const DIRECT_URL = import.meta.env.VITE_ZHIPU_API_URL ?? 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const API_URL = USE_PROXY ? '/api/chat' : DIRECT_URL

export async function streamChat(
  messages: Message[],
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (!USE_PROXY) {
    const apiKey = localStorage.getItem('zhipu_api_key') ?? import.meta.env.VITE_ZHIPU_API_KEY
    if (!apiKey) throw new Error('API Key 未设置，请点击左上角 API Key 按钮填入')
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: MODEL, messages, stream: true }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    for (const line of chunk.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') return

      try {
        const json = JSON.parse(data) as {
          choices: Array<{ delta: { content?: string } }>
        }
        const text = json.choices[0]?.delta?.content
        if (text) onChunk(text)
      } catch {
        // skip malformed lines
      }
    }
  }
}
