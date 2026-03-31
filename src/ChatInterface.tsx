import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { streamChat } from './api'
import type { Message } from './types'

const STORAGE_KEY = 'chat_history'
const API_KEY_STORAGE = 'zhipu_api_key'

function ApiKeyModal({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState(() => localStorage.getItem(API_KEY_STORAGE) ?? '')

  function save() {
    const trimmed = value.trim()
    if (trimmed) {
      localStorage.setItem(API_KEY_STORAGE, trimmed)
    } else {
      localStorage.removeItem(API_KEY_STORAGE)
    }
    onClose()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-[90%] max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-[#333] mb-1">设置 API Key</h2>
        <p className="text-xs text-gray-400 mb-4">Key 仅保存在本地浏览器，不会上传</p>
        <input
          type="password"
          autoFocus
          className="w-full border border-[#d9d9d9] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#07c160] mb-4"
          placeholder="请输入智谱 AI API Key"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 transition-colors"
          >
            取消
          </button>
          <button
            onClick={save}
            className="px-4 py-2 rounded-lg bg-[#07c160] text-white text-sm font-medium hover:bg-[#06ad56] transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 px-2 py-0.5 text-xs rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors opacity-0 group-hover:opacity-100"
    >
      {copied ? '已复制' : '复制'}
    </button>
  )
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="text-red-400 hover:text-red-600 font-medium">✕</button>
    </div>
  )
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? (JSON.parse(saved) as Message[]) : []
    } catch {
      return []
    }
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Save to localStorage whenever messages change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
  }, [messages])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function clearHistory() {
    localStorage.removeItem(STORAGE_KEY)
    setMessages([])
    setError(null)
  }

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    setError(null)
    const userMsg: Message = { role: 'user', content: text }
    const history = [...messages, userMsg]
    setMessages(history)
    setInput('')
    setLoading(true)

    setMessages([...history, { role: 'assistant', content: '' }])

    abortRef.current = new AbortController()

    try {
      await streamChat(
        history,
        (chunk) => {
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              next[next.length - 1] = { ...last, content: last.content + chunk }
            }
            return next
          })
        },
        abortRef.current.signal
      )
    } catch (err) {
      const e = err as Error
      if (e.name === 'AbortError') {
        // user cancelled — remove empty assistant bubble
        setMessages((prev) => {
          const next = [...prev]
          if (next[next.length - 1]?.content === '') next.pop()
          return next
        })
      } else {
        setMessages((prev) => {
          const next = [...prev]
          next[next.length - 1] = { role: 'assistant', content: '' }
          return next
        })
        setError(
          e.message.includes('API Key')
            ? e.message
            : e.message.includes('API error')
            ? `请求失败：${e.message}`
            : 'API Key 为空或无效，请点击左上角 API Key 按钮填入'
        )
      }
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }, [input, loading, messages])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function stopGeneration() {
    abortRef.current?.abort()
  }

  return (
    <div className="flex flex-col h-screen bg-[#ededed]">
      {showApiKey && <ApiKeyModal onClose={() => setShowApiKey(false)} />}
      {/* Header */}
      <div className="bg-[#f7f7f7] border-b border-[#d9d9d9] px-4 py-3 flex items-center justify-between shadow-sm">
        <button
          onClick={() => setShowApiKey(true)}
          className="text-xs text-[#576b95] hover:text-[#07c160] transition-colors w-16"
        >
          API Key
        </button>
        <span className="text-base font-medium text-[#333]">AI 助手</span>
        <button
          onClick={clearHistory}
          disabled={messages.length === 0}
          className="text-xs text-[#999] hover:text-red-500 disabled:opacity-30 transition-colors w-16 text-right"
        >
          清空对话
        </button>
      </div>

      {/* Message list */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-gray-400 mt-10">发送消息开始对话</p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex items-start gap-2 ${
              msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
            }`}
          >
            {/* Avatar */}
            <div
              className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-bold ${
                msg.role === 'user' ? 'bg-[#07c160]' : 'bg-[#576b95]'
              }`}
            >
              {msg.role === 'user' ? '我' : 'AI'}
            </div>

            {/* Bubble */}
            <div className="relative group max-w-[70%]">
              <div
                className={`rounded-lg px-3 py-2 text-sm leading-relaxed shadow-sm prose prose-sm max-w-none ${
                  msg.role === 'user'
                    ? 'bg-[#95ec69] text-black rounded-tr-none'
                    : 'bg-white text-black rounded-tl-none'
                }`}
              >
                {msg.content === '' && loading && i === messages.length - 1 ? (
                  <span className="inline-flex gap-1 py-1">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </span>
                ) : (
                  <ReactMarkdown
                    components={{
                      code({ className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className ?? '')
                        const inline = !match
                        return inline ? (
                          <code className="bg-gray-100 px-1 rounded text-xs" {...props}>
                            {children}
                          </code>
                        ) : (
                          <div className="relative group/code">
                            <SyntaxHighlighter
                              style={oneDark}
                              language={match[1]}
                              PreTag="div"
                              customStyle={{ borderRadius: '6px', fontSize: '13px' }}
                            >
                              {String(children).replace(/\n$/, '')}
                            </SyntaxHighlighter>
                            <button
                              onClick={() =>
                                navigator.clipboard.writeText(
                                  String(children).replace(/\n$/, '')
                                )
                              }
                              className="absolute top-2 right-2 px-2 py-0.5 text-xs rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors opacity-0 group-hover/code:opacity-100"
                            >
                              复制
                            </button>
                          </div>
                        )
                      },
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                )}
              </div>
              {/* Copy button for assistant messages */}
              {msg.role === 'assistant' && msg.content && (
                <CopyButton text={msg.content} />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Error banner */}
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Input area */}
      <div className="bg-[#f7f7f7] border-t border-[#d9d9d9] px-4 py-3 flex items-end gap-2">
        <textarea
          className="flex-1 resize-none rounded-lg border border-[#d9d9d9] bg-white px-3 py-2 text-sm outline-none focus:border-[#07c160] max-h-32 min-h-[40px]"
          rows={1}
          placeholder="输入消息… (Enter 发送，Shift+Enter 换行)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        {loading ? (
          <button
            onClick={stopGeneration}
            className="px-4 py-2 rounded-lg bg-gray-400 text-white text-sm font-medium hover:bg-gray-500 transition-colors"
          >
            停止
          </button>
        ) : (
          <button
            onClick={send}
            disabled={!input.trim()}
            className="px-4 py-2 rounded-lg bg-[#07c160] text-white text-sm font-medium disabled:opacity-40 hover:bg-[#06ad56] active:bg-[#059a4d] transition-colors"
          >
            发送
          </button>
        )}
      </div>
    </div>
  )
}
