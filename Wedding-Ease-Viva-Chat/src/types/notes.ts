import { Timestamp } from 'firebase/firestore'

export type NoteCategory = 'venue' | 'catering' | 'decor' | 'attire' | 'guest_list' | 'ceremony' | 'reception' | 'honeymoon' | 'budget' | 'vendor' | 'general'

export type NotePermission = 'editor' | 'commenter' | 'viewer'

export interface Collaborator {
  userId: string
  email: string
  name: string
  permission: NotePermission
  addedAt: Timestamp
  addedBy: string
}

export interface PublicAccess {
  enabled: boolean
  permission: 'view' | 'comment' | 'edit'
  shareId: string
  password: string | null
  expiresAt: Timestamp | null
  createdAt: Timestamp
}

export interface Note {
  id: string
  title: string
  icon: string | null
  coverImage: string | null
  content: string // Tiptap JSON stringified
  folderId: string | null
  tags: string[]
  category: NoteCategory
  color: string | null
  favorited: boolean
  ownerId: string
  ownerEmail: string
  collaborators: Collaborator[]
  collaboratorEmails: string[]
  publicAccess: PublicAccess
  publicShareId: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
  lastEditedBy: string
  wordCount: number
  isDeleted: boolean
  deletedAt: Timestamp | null
  sourceThreadId: string | null
  sourceType: 'manual' | 'from_chat' | 'template'
  templateId: string | null
}

export interface NoteFolder {
  id: string
  name: string
  icon: string | null
  ownerId: string
  order: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface NoteComment {
  id: string
  noteId: string
  blockId: string
  anchorText: string
  authorId: string
  authorName: string
  authorEmail: string
  content: string
  parentCommentId: string | null
  resolved: boolean
  resolvedBy: string | null
  resolvedAt: Timestamp | null
  reactions: Record<string, string[]>
  createdAt: Timestamp
  updatedAt: Timestamp
  isEdited: boolean
  isDeleted: boolean
}

export interface NoteInvitation {
  id: string
  noteId: string
  noteTitle: string
  invitedBy: string
  invitedByName: string
  invitedByEmail: string
  inviteeEmail: string
  inviteeUserId: string | null
  permission: NotePermission
  message: string | null
  status: 'pending' | 'accepted' | 'declined' | 'revoked'
  createdAt: Timestamp
  respondedAt: Timestamp | null
  expiresAt: Timestamp | null
}

export interface NoteTemplate {
  id: string
  title: string
  description: string
  icon: string
  category: NoteCategory
  content: string // Tiptap JSON
}
