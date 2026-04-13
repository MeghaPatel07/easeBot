import { useState, useCallback } from 'react'
import type { SendMessageOptions } from '@/hooks/useChat'

const MAX_REFERENCE_BYTES = 8 * 1024 * 1024
const ALLOWED_REFERENCE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

type AspectRatio = 'auto' | '1024x1024' | '1024x1536' | '1536x1024' | '1024x1792'

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') resolve(result)
      else reject(new Error('Failed to read image file.'))
    }
    reader.onerror = () => reject(new Error('Failed to read image file.'))
    reader.readAsDataURL(file)
  })
}

interface UseImageHubSubmitDeps {
  sendMessage: (text: string, options: SendMessageOptions) => Promise<void>
  startNewChat: () => void
  vibeTitle?: string
  vibeDescriptors?: string[]
  vibeDescription?: string
}

export function useImageHubSubmit(deps: UseImageHubSubmitDeps): {
  submit: (input: {
    prompt: string
    aspectRatio: AspectRatio
    referenceImage?: File | null
  }) => Promise<void>
  isSubmitting: boolean
} {
  const { sendMessage, startNewChat, vibeTitle, vibeDescriptors, vibeDescription } = deps
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = useCallback(
    async ({
      prompt,
      aspectRatio,
      referenceImage,
    }: {
      prompt: string
      aspectRatio: AspectRatio
      referenceImage?: File | null
    }): Promise<void> => {
      const trimmed = prompt.trim()
      if (!trimmed) {
        throw new Error('Please enter a prompt before generating.')
      }

      // Fold the selected vibe's full description straight into the user
      // message so the LLM sees it as part of the request (in addition to the
      // vibeDescriptors field which biases the system prompt). Fall back to
      // the descriptor list if no description was supplied.
      let styleSuffix = ''
      if (vibeDescription && vibeDescription.trim().length > 0) {
        styleSuffix = `\n\nStyle${vibeTitle ? ` (${vibeTitle})` : ''}: ${vibeDescription.trim()}`
      } else if (vibeDescriptors && vibeDescriptors.length > 0) {
        styleSuffix = `\n\nStyle${vibeTitle ? ` (${vibeTitle})` : ''}: ${vibeDescriptors.join(', ')}.`
      }
      const messageText = trimmed + styleSuffix

      let attachedImageUrl: string | undefined
      if (referenceImage) {
        if (!ALLOWED_REFERENCE_TYPES.has(referenceImage.type)) {
          throw new Error('Reference image must be JPEG, PNG, or WebP.')
        }
        if (referenceImage.size > MAX_REFERENCE_BYTES) {
          throw new Error('Reference image must be under 8 MB.')
        }
        attachedImageUrl = await readFileAsDataUrl(referenceImage)
      }

      setIsSubmitting(true)
      try {
        startNewChat()
        // Index.tsx has an effect that navigates to /chat/:threadId once
        // activeThreadId is set, so we don't navigate manually here.
        await sendMessage(messageText, {
          forceImageGeneration: true,
          // Omit preferredAspectRatio when 'auto' so the LLM picks based on
          // the prompt (portrait for people, landscape for venues, etc.).
          ...(aspectRatio !== 'auto' ? { preferredAspectRatio: aspectRatio } : {}),
          vibeTitle,
          vibeDescriptors,
          ...(attachedImageUrl
            ? (() => {
                const match = attachedImageUrl!.match(/^data:([^;]+);base64,(.*)$/)
                if (!match) return {}
                return {
                  imageBase64: match[2],
                  imageMimeType: match[1],
                }
              })()
            : {}),
        })
      } catch (err) {
        setIsSubmitting(false)
        throw err
      }
      setIsSubmitting(false)
    },
    [startNewChat, sendMessage, vibeTitle, vibeDescriptors, vibeDescription],
  )

  return { submit, isSubmitting }
}
