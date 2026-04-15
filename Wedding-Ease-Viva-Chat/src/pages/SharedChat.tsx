import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getSharedChat, type SharedChatData } from '@/services/chatService'
import { Loader2, ArrowLeft, MessageSquare } from 'lucide-react'

export default function SharedChat() {
  const { shareId } = useParams<{ shareId: string }>()
  const [data, setData] = useState<SharedChatData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!shareId) return
    getSharedChat(shareId)
      .then(result => {
        if (!result) setError('This shared conversation has expired or does not exist.')
        else setData(result)
      })
      .catch(() => setError('Failed to load shared conversation.'))
      .finally(() => setLoading(false))
  }, [shareId])

  if (loading) {
    return (
      <div className="min-h-[100vh] min-h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-[100vh] min-h-[100dvh] flex flex-col items-center justify-center bg-background gap-4">
        <MessageSquare className="h-12 w-12 text-stone-300" />
        <p className="text-stone-500 text-sm">{error || 'Conversation not found.'}</p>
        <Link to="/" className="text-primary text-sm hover:underline flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Viva
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-[100vh] min-h-[100dvh] bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-border px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-primary hover:text-primary/80 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-sm font-bold text-stone-800">{data.threadTitle}</h1>
            <p className="text-2xs text-stone-400">
              Shared {data.sharedAt.toLocaleDateString()} &middot; Expires {data.expiresAt.toLocaleDateString()}
            </p>
          </div>
        </div>
        <span className="text-2xs text-stone-400 bg-stone-100 px-2 py-1 rounded-full uppercase tracking-wider font-medium">Read-only</span>
      </header>

      {/* Messages */}
      <div className="max-w-2xl mx-auto px-5 py-6 space-y-5">
        {data.messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'user' ? (
              <div className="max-w-[85vw] sm:max-w-xs md:max-w-md lg:max-w-lg px-4 py-2.5 rounded-2xl rounded-tr-sm bg-secondary text-white shadow-sm">
                <p className="text-caption leading-relaxed">{msg.content}</p>
              </div>
            ) : (
              <div className="max-w-[85vw] sm:max-w-xs md:max-w-md lg:max-w-lg">
                <div className="mb-1 w-full prose prose-sm max-w-none leading-relaxed bg-white/[0.04] backdrop-blur-md p-4 rounded-2xl rounded-tl-sm shadow-[0_8px_32px_rgba(0,0,0,0.37)] border border-white/10 text-[#D9C3C3]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-mode-stylist-dark hover:text-mode-stylist underline underline-offset-2 font-medium transition-colors">
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="text-center py-8">
        <p className="text-2xs text-stone-400 uppercase tracking-[0.2em] font-medium">
          Shared from Viva &mdash; Your Wedding AI Concierge
        </p>
        <Link to="/" className="inline-block mt-2 text-xs text-primary hover:underline">
          Try Viva for your wedding planning
        </Link>
      </div>
    </div>
  )
}
