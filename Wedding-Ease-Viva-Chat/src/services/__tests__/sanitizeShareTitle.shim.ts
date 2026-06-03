// Re-export shim for sanitizeShareTitle so the node:test runner can import the
// pure helper WITHOUT pulling in chatService.ts's firebase/firestore deps.
// Keep this function definition byte-for-byte identical to the source in
// src/services/chatService.ts — see WE-20260528-107.

export function sanitizeShareTitle(rawTitle: string | null | undefined): string {
  let s = (rawTitle || '').replace(/<[^>]+>/g, '')
  const mdLink = /\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g
  let prev: string
  do {
    prev = s
    s = s.replace(mdLink, '$1')
  } while (s !== prev)
  return s.replace(/[<>[\]()]/g, '').trim().slice(0, 80)
}
