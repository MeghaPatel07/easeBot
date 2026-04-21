import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

const BLOCK_ID_TYPES = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'image',
  'taskList',
  'taskItem',
  'callout',
  'toggle',
  'table',
]

const pluginKey = new PluginKey('blockIdStamper')

export const BlockId = Extension.create({
  name: 'blockId',

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_ID_TYPES,
        attributes: {
          blockId: {
            default: null,
            keepOnSplit: false,
            parseHTML: (element) => element.getAttribute('data-block-id') || null,
            renderHTML: (attributes) => {
              if (!attributes.blockId) return {}
              return { 'data-block-id': attributes.blockId }
            },
          },
        },
      },
    ]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pluginKey,
        appendTransaction: (transactions, _oldState, newState) => {
          const docChanged = transactions.some((tr) => tr.docChanged)
          if (!docChanged) return null

          const tr = newState.tr
          const seen = new Set<string>()
          let modified = false

          newState.doc.descendants((node, pos) => {
            if (!BLOCK_ID_TYPES.includes(node.type.name)) return
            const id = node.attrs.blockId as string | null
            if (!id || seen.has(id)) {
              const newId =
                typeof crypto !== 'undefined' && crypto.randomUUID
                  ? crypto.randomUUID()
                  : `b_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: newId })
              seen.add(newId)
              modified = true
            } else {
              seen.add(id)
            }
          })

          return modified ? tr.setMeta('addToHistory', false) : null
        },
      }),
    ]
  },
})

export default BlockId
