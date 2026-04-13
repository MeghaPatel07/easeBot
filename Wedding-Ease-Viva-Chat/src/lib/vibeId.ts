// Slugify mirrors easebot-backend/src/controllers/chatController.ts slugify().
// Backend writes UserImage.vibeId = buildVibeId(vibeTitle); the "Current Vibe"
// gallery filter compares img.vibeId === activeVibe.id, so the two must agree.
export function slugifyVibeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function buildVibeId(title: string): string | null {
  const slug = slugifyVibeTitle(title)
  return slug ? `vibe-${slug}` : null
}
