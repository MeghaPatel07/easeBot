import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getSharedChat, type SharedChatData } from '@/services/chatService'
import { Loader2, ArrowLeft, MessageSquare } from 'lucide-react'
import { track } from '@/lib/analytics'
import { useAuth } from '@/contexts/AuthContext'

const BAD_IMG_HOSTS = ['cdn.openai.com', 'example.com', 'placeholder.com', 'placehold.it']

export default function SharedChat() {
  const { shareId } = useParams<{ shareId: string }>()
  const { user } = useAuth()
  const [data, setData] = useState<SharedChatData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!shareId) return
    getSharedChat(shareId)
      .then(result => {
        if (!result) setError('This shared conversation has expired or does not exist.')
        else {
          setData(result)
          track('shared_thread_viewed', { thread_id: shareId, is_authenticated: !!user })
        }
      })
      .catch(() => setError('Failed to load shared conversation.'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId])

  if (loading) {
    return (
      <div className="gradient-bg min-h-[100vh] min-h-[100dvh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="gradient-bg min-h-[100vh] min-h-[100dvh] flex flex-col items-center justify-center gap-4">
        <MessageSquare className="h-12 w-12 text-foreground/30" />
        <p className="text-foreground/60 text-sm">{error || 'Conversation not found.'}</p>
        <Link to="/" className="text-primary text-sm hover:underline flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to TheWeddingBot
        </Link>
      </div>
    )
  }

  return (
    <div className="gradient-bg min-h-[100vh] min-h-[100dvh]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card-elevated/90 backdrop-blur-md border-b border-foreground/[0.08] px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-primary hover:text-primary/80 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>

            {/*
              SECURITY (WE-20260528-107): render threadTitle as a plain text
              node only — do NOT wrap in <ReactMarkdown> or any component that
              uses dangerouslySetInnerHTML. Title is sanitized at write time in
              chatService.createSharedChat() but this is the layer-2 belt that
              keeps us safe even if a stale doc predates the sanitizer.
            */}
      

            <h1 className="text-sm font-bold text-foreground/80">{data.threadTitle}</h1>
            <p className="text-2xs text-muted-foreground">

              Shared {data.sharedAt.toLocaleDateString()} &middot; Expires {data.expiresAt.toLocaleDateString()}
            </p>
          </div>
        </div>
        <span className="text-2xs text-muted-foreground bg-foreground/[0.06] px-2 py-1 rounded-full uppercase tracking-wider font-medium">Read-only</span>
      </header>

      {/* Messages */}
      <div className="max-w-2xl mx-auto px-5 py-6 space-y-5">
        {data.messages.map((msg, i) => {
          const carouselUrls = (msg.imageUrls && msg.imageUrls.length > 0)
            ? msg.imageUrls
            : (msg.imageUrl ? [msg.imageUrl] : [])
          return (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'user' ? (
                <div className="max-w-[85vw] sm:max-w-xs md:max-w-md lg:max-w-lg px-4 py-2.5 rounded-2xl rounded-tr-sm bg-secondary text-secondary-foreground shadow-sm">
                  <p className="text-caption leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </div>
              ) : (
                <div className="max-w-[85vw] sm:max-w-xs md:max-w-md lg:max-w-lg w-full">
                  {msg.mode && (
                    <span className="inline-block mb-1.5 text-3xs uppercase tracking-wider font-semibold text-primary/80 bg-primary/10 rounded-full px-2 py-0.5">
                      {msg.mode}
                    </span>
                  )}
                  <div className="mb-1 w-full prose prose-sm max-w-none leading-relaxed bg-foreground/[0.04] backdrop-blur-md p-4 rounded-2xl rounded-tl-sm shadow-glass text-foreground/90 prose-headings:text-foreground/90 prose-strong:text-foreground/95 prose-li:text-foreground/85 prose-p:text-foreground/85 prose-a:text-primary prose-a:no-underline prose-img:my-1">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ href, children }) => (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="text-mode-stylist-dark hover:text-mode-stylist underline underline-offset-2 font-medium transition-colors">
                            {children}
                          </a>
                        ),
                        img: ({ src, alt }: any) => {
                          if (typeof src === 'string' && BAD_IMG_HOSTS.some(h => src.includes(h))) {
                            return null
                          }
                          // Skip inline images that are already rendered by the
                          // generated-image carousel below.
                          if (typeof src === 'string' && carouselUrls.includes(src)) {
                            return null
                          }
                          return (
                            <img
                              src={src}
                              alt={alt ?? ''}
                              className="max-w-full w-[120px] sm:w-[200px] h-auto sm:h-[200px] object-cover rounded-xl shadow-sm flex-shrink-0"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                            />
                          )
                        },
                        // Old-style inline product lines: `![Name](img) [Name](url)|desc`.
                        // Render as a card when the <li> contains both an img and an anchor.
                        li: ({ children }: any) => {
                          const flat = (nodes: React.ReactNode): React.ReactNode[] =>
                            React.Children.toArray(nodes).flatMap(n =>
                              React.isValidElement(n) && (n.type === 'p' || n.type === 'span')
                                ? flat((n.props as { children?: React.ReactNode }).children)
                                : [n]
                            )
                          const kids = flat(children)
                          const imgNode = kids.find(n => React.isValidElement(n) && 'src' in (n.props as object)) as React.ReactElement<{ src: string; alt?: string }> | undefined
                          const anchorNode = kids.find(n => React.isValidElement(n) && 'href' in (n.props as object)) as React.ReactElement<{ href: string; children: React.ReactNode }> | undefined
                          if (imgNode && anchorNode) {
                            const textNodes = kids.filter(n => typeof n === 'string') as string[]
                            const rawMeta = textNodes.join('').replace(/^\|/, '')
                            const description = rawMeta.split('|').slice(1).join('|').trim()
                            const href = anchorNode.props.href ?? '#'
                            const title = anchorNode.props.children
                            const imageUrl = imgNode.props.src
                            return (
                              <li className="list-none mb-3 not-prose">
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex flex-row gap-3 items-start p-3 rounded-2xl border border-foreground/10 bg-foreground/[0.04] backdrop-blur-md shadow-glass hover:bg-foreground/[0.06] hover:border-primary/40 transition-all duration-200 no-underline"
                                >
                                  <img
                                    src={imageUrl}
                                    alt={typeof title === 'string' ? title : ''}
                                    className="w-[80px] h-[80px] object-cover rounded-xl flex-shrink-0"
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                                  />
                                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                    <span className="text-sm font-semibold text-primary leading-snug line-clamp-1">{title}</span>
                                    {description && <span className="text-xs text-foreground/60 leading-relaxed line-clamp-2">{description}</span>}
                                  </div>
                                </a>
                              </li>
                            )
                          }
                          return <li>{children}</li>
                        },
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>

                  {/* Generated images (carousel simplified to a vertical strip for share view) */}
                  {carouselUrls.length > 0 && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {carouselUrls.map((url, idx) => (
                        <img
                          key={`${idx}-${url}`}
                          src={url}
                          alt=""
                          className="w-full h-auto object-cover rounded-xl shadow-sm"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                        />
                      ))}
                    </div>
                  )}

                  {/* Recommended products sidecar (read-only) */}
                  {msg.products && msg.products.length > 0 && (
                    <div className="mt-3">
                      <span className="text-3xs uppercase tracking-wider text-foreground/40 font-semibold">
                        Recommended from WeddingEase
                      </span>
                      <div className="mt-1.5 flex flex-col gap-2">
                        {msg.products.map((p) => (
                          <a
                            key={p.uid}
                            href={p.productUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex flex-row gap-3 items-start p-3 rounded-2xl border border-foreground/10 bg-foreground/[0.04] backdrop-blur-md shadow-glass hover:bg-foreground/[0.06] hover:border-primary/40 transition-all duration-200 no-underline"
                          >
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              className="w-[80px] h-[80px] object-cover rounded-xl flex-shrink-0"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                            />
                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                              <span className="text-sm font-semibold text-primary leading-snug line-clamp-1">{p.name}</span>
                              {p.description && (
                                <span className="text-xs text-foreground/60 leading-relaxed line-clamp-2">{p.description}</span>
                              )}
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="text-center py-8">
        <p className="text-2xs text-foreground/40 uppercase tracking-[0.2em] font-medium">
          Shared from TheWeddingBot &mdash; Your Wedding AI Concierge
        </p>
        <Link to="/" className="inline-block mt-2 text-xs text-primary hover:underline">
          Try TheWeddingBot for your wedding planning
        </Link>
      </div>
    </div>
  )
}
