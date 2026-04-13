import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
  handleCreateNote, handleGetNote, handleUpdateNote, handleDeleteNote,
  handleRestoreNote, handlePermanentDelete, handleGetUserNotes,
  handleAddCollaborator, handleSendInvites, handleRemoveCollaborator, handleUpdateCollaboratorPermission,
  handleEnablePublicLink, handleDisablePublicLink, handleGetSharedNote,
  handleAddComment, handleGetComments, handleUpdateComment, handleDeleteComment,
  handleResolveComment,
  handleCreateFolder, handleGetFolders, handleUpdateFolder, handleDeleteFolder,
  handleMoveNote,
} from '../controllers/notesController'

const router = Router()

// Notes CRUD
router.post('/', requireAuth, handleCreateNote)
router.get('/', requireAuth, handleGetUserNotes)
router.get('/shared/:shareId', handleGetSharedNote) // NO auth — public access
router.get('/:noteId', requireAuth, handleGetNote)
router.patch('/:noteId', requireAuth, handleUpdateNote)
router.delete('/:noteId', requireAuth, handleDeleteNote)
router.post('/:noteId/restore', requireAuth, handleRestoreNote)
router.delete('/:noteId/permanent', requireAuth, handlePermanentDelete)

// Sharing
router.post('/:noteId/share', requireAuth, handleAddCollaborator)
router.post('/:noteId/share/notify', requireAuth, handleSendInvites)
router.delete('/:noteId/share/:userId', requireAuth, handleRemoveCollaborator)
router.patch('/:noteId/share/:userId', requireAuth, handleUpdateCollaboratorPermission)
router.post('/:noteId/public-link', requireAuth, handleEnablePublicLink)
router.delete('/:noteId/public-link', requireAuth, handleDisablePublicLink)

// Comments
router.post('/:noteId/comments', requireAuth, handleAddComment)
router.get('/:noteId/comments', requireAuth, handleGetComments)
router.patch('/:noteId/comments/:commentId', requireAuth, handleUpdateComment)
router.delete('/:noteId/comments/:commentId', requireAuth, handleDeleteComment)
router.post('/:noteId/comments/:commentId/resolve', requireAuth, handleResolveComment)

// Folders
router.post('/folders', requireAuth, handleCreateFolder)
router.get('/folders', requireAuth, handleGetFolders)
router.patch('/folders/:folderId', requireAuth, handleUpdateFolder)
router.delete('/folders/:folderId', requireAuth, handleDeleteFolder)
router.patch('/:noteId/move', requireAuth, handleMoveNote)

export default router
