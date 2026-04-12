import { useEffect, useRef } from "react";
import { useEditor, EditorContent, ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import { Node } from "@tiptap/core";
import FloatingToolbar from "./toolbar/FloatingToolbar";
import SlashCommandMenu from "./toolbar/SlashCommandMenu";
import ResizableImageView from "./ResizableImageView";

import type { Editor } from "@tiptap/react";

const CalloutExtension = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return { type: { default: 'info' } };
  },
  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', { ...HTMLAttributes, 'data-callout': HTMLAttributes.type, class: 'callout-block' }, 0];
  },
});

// Kept for backward compatibility — parses existing toggle content in Firestore
const ToggleExtension = Node.create({
  name: 'toggle',
  group: 'block',
  content: 'block+',
  defining: true,
  parseHTML() {
    return [{ tag: 'details' }];
  },
  renderHTML() {
    return ['details', { class: 'toggle-block' }, ['summary', 'Toggle'], 0];
  },
});

const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: null },
      alignment: { default: 'center' },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});

const MAX_PASTE_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

interface NoteEditorProps {
  noteId: string | null;
  content: string;
  onUpdate: (content: string) => void;
  onEditorReady?: (editor: Editor) => void;
  onImageUpload?: (file: File) => Promise<string | null>;
  readOnly?: boolean;
  placeholder?: string;
}

function parseContent(content: string) {
  if (!content || content.trim() === "") return undefined;
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

export default function NoteEditor({
  noteId,
  content,
  onUpdate,
  onEditorReady,
  onImageUpload,
  readOnly = false,
  placeholder = "Start writing, or type '/' for commands...",
}: NoteEditorProps) {
  const prevNoteIdRef = useRef(noteId);
  const onImageUploadRef = useRef(onImageUpload);
  onImageUploadRef.current = onImageUpload;
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true },
      }),
      ResizableImage.configure({ inline: false, allowBase64: true }),
      // Table + Toggle kept for parsing existing content (hidden from menus)
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      ToggleExtension,
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder }),
      CharacterCount,
      Color,
      TextStyle,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      CalloutExtension,
    ],
    content: parseContent(content),
    editable: !readOnly,
    onUpdate: ({ editor: ed }) => {
      onUpdate(JSON.stringify(ed.getJSON()));
    },
    editorProps: {
      attributes: {
        class: "prose-editor-content outline-none min-h-[500px] text-white/90",
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (!file) continue;
            if (file.size > MAX_PASTE_IMAGE_SIZE) {
              alert('Image is too large. Maximum size is 10MB.');
              event.preventDefault();
              return true;
            }
            // Upload to Storage instead of embedding base64
            event.preventDefault();
            const upload = onImageUploadRef.current;
            if (upload) {
              upload(file).then((url) => {
                if (url && view.state) {
                  const { tr } = view.state;
                  const node = view.state.schema.nodes.image?.create({ src: url });
                  if (node) {
                    view.dispatch(tr.replaceSelectionWith(node));
                  }
                }
              });
            }
            return true;
          }
        }
        return false;
      },
    },
  });

  // Sync editor content when switching notes
  useEffect(() => {
    if (!editor) return;
    if (prevNoteIdRef.current !== noteId) {
      prevNoteIdRef.current = noteId;
      const parsed = parseContent(content);
      editor.commands.setContent(parsed ?? { type: 'doc', content: [{ type: 'paragraph' }] });
    }
  }, [editor, noteId, content]);

  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
  }, [editor, onEditorReady]);

  if (!editor) {
    return (
      <div className="relative min-h-[500px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 border-2 border-white/20 border-t-[#C6944A] rounded-full animate-spin" />
          <span className="text-sm text-white/30">Loading editor...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <style>{editorStyles}</style>
      {!readOnly && <FloatingToolbar editor={editor} />}
      <EditorContent editor={editor} />
      {!readOnly && <SlashCommandMenu editor={editor} onImageUpload={onImageUpload} />}
    </div>
  );
}

const editorStyles = `
.ProseMirror {
  outline: none;
  min-height: 500px;
  padding: 0;
}
.ProseMirror h1 {
  font-size: 2em;
  font-weight: 700;
  margin: 1em 0 0.5em;
  font-family: 'Lato', serif;
}
.ProseMirror h2 {
  font-size: 1.5em;
  font-weight: 600;
  margin: 0.8em 0 0.4em;
  font-family: 'Lato', serif;
}
.ProseMirror h3 {
  font-size: 1.25em;
  font-weight: 600;
  margin: 0.6em 0 0.3em;
}
.ProseMirror p {
  margin: 0.3em 0;
}
.ProseMirror ul {
  padding-left: 1.5em;
  list-style-type: disc;
}
.ProseMirror ul ul {
  list-style-type: circle;
}
.ProseMirror ul ul ul {
  list-style-type: square;
}
.ProseMirror ol {
  padding-left: 1.5em;
  list-style-type: decimal;
}
.ProseMirror ol ol {
  list-style-type: lower-alpha;
}
.ProseMirror ol ol ol {
  list-style-type: lower-roman;
}
.ProseMirror li {
  margin: 0.15em 0;
}
.ProseMirror li p {
  margin: 0;
}
.ProseMirror blockquote {
  border-left: 3px solid #C6944A;
  padding-left: 1em;
  margin: 0.5em 0;
  opacity: 0.85;
}
.ProseMirror pre {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 12px;
  font-family: monospace;
  overflow-x: auto;
}
.ProseMirror code {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  padding: 2px 4px;
  font-family: monospace;
  font-size: 0.9em;
}
.ProseMirror img {
  max-width: 100%;
  border-radius: 8px;
}
.ProseMirror [data-node-view-wrapper] {
  margin: 0.5em 0;
}
.ProseMirror table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5em 0;
}
.ProseMirror th,
.ProseMirror td {
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 8px 12px;
  text-align: left;
}
.ProseMirror th {
  background: rgba(198, 148, 74, 0.15);
  font-weight: 600;
}
.ProseMirror hr {
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  margin: 1em 0;
}
.ProseMirror ul[data-type="taskList"] {
  list-style: none;
  padding-left: 0;
}
.ProseMirror ul[data-type="taskList"] li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.ProseMirror ul[data-type="taskList"] li label input[type="checkbox"] {
  accent-color: #C6944A;
  margin-top: 4px;
}
.ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: rgba(255, 255, 255, 0.3);
  pointer-events: none;
  float: left;
  height: 0;
}
.ProseMirror .is-empty::before {
  content: attr(data-placeholder);
  color: rgba(255, 255, 255, 0.3);
  pointer-events: none;
  float: left;
  height: 0;
}
.ProseMirror mark {
  border-radius: 2px;
  padding: 1px 2px;
}
.ProseMirror a {
  color: #C6944A;
  text-decoration: underline;
  cursor: pointer;
}
.ProseMirror ::selection {
  background: rgba(198, 148, 74, 0.3);
}
.ProseMirror .callout-block {
  background: rgba(198, 148, 74, 0.08);
  border-left: 4px solid #C6944A;
  border-radius: 6px;
  padding: 12px 16px;
  margin: 0.5em 0;
}
.ProseMirror .callout-block[data-callout="info"] {
  background: rgba(59, 130, 246, 0.08);
  border-left-color: #3b82f6;
}
.ProseMirror .callout-block[data-callout="warning"] {
  background: rgba(234, 179, 8, 0.08);
  border-left-color: #eab308;
}
.ProseMirror .callout-block[data-callout="error"] {
  background: rgba(239, 68, 68, 0.08);
  border-left-color: #ef4444;
}
.ProseMirror .toggle-block {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 8px 12px;
  margin: 0.5em 0;
}
.ProseMirror .toggle-block summary {
  cursor: pointer;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  user-select: none;
  padding: 4px 0;
}
.ProseMirror .toggle-block summary:hover {
  color: rgba(255, 255, 255, 0.9);
}
`;
