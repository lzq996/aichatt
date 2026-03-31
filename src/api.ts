import type { Message } from './types'

const API_URL = import.meta.env.VITE_ZHIPU_API_URL ?? 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const API_KEY = import.meta.env.VITE_ZHIPU_API_KEY as string
const MODEL = import.meta.env.VITE_ZHIPU_MODEL ?? 'glm-4'

export async function streamChat(
  messages: Message[],
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
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
