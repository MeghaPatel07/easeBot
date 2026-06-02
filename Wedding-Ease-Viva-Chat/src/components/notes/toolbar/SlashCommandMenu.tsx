import { useState, useEffect, useCallback, useRef, useId } from "react";
import { Editor } from "@tiptap/react";
import {
  AlignLeft,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Minus,
  Code2,
  ImageIcon,
  AlertCircle,
} from "lucide-react";
import { track } from "@/lib/analytics";

type SlashSlug =
  | "text"
  | "heading_1"
  | "heading_2"
  | "heading_3"
  | "bullet_list"
  | "numbered_list"
  | "todo"
  | "quote"
  | "divider"
  | "code"
  | "image"
  | "callout";

interface SlashCommandMenuProps {
  editor: Editor;
  onImageUpload?: (file: File) => Promise<string | null>;
}

interface CommandItem {
  name: string;
  slug: SlashSlug;
  description: string;
  icon: React.ReactNode;
  action: (editor: Editor, onImageUpload?: (file: File) => Promise<string | null>) => void;
}

const COMMANDS: CommandItem[] = [
  {
    name: "Text",
    slug: "text",
    description: "Plain text paragraph",
    icon: <AlignLeft className="h-4 w-4" />,
    action: (editor) =>
      editor.chain().focus().setParagraph().run(),
  },
  {
    name: "Heading 1",
    slug: "heading_1",
    description: "Large heading",
    icon: <Heading1 className="h-4 w-4" />,
    action: (editor) =>
      editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    name: "Heading 2",
    slug: "heading_2",
    description: "Medium heading",
    icon: <Heading2 className="h-4 w-4" />,
    action: (editor) =>
      editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    name: "Heading 3",
    slug: "heading_3",
    description: "Small heading",
    icon: <Heading3 className="h-4 w-4" />,
    action: (editor) =>
      editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    name: "Bullet List",
    slug: "bullet_list",
    description: "Unordered list",
    icon: <List className="h-4 w-4" />,
    action: (editor) =>
      editor.chain().focus().toggleBulletList().run(),
  },
  {
    name: "Numbered List",
    slug: "numbered_list",
    description: "Ordered list",
    icon: <ListOrdered className="h-4 w-4" />,
    action: (editor) =>
      editor.chain().focus().toggleOrderedList().run(),
  },
  {
    name: "To-do",
    slug: "todo",
    description: "Checkbox task item",
    icon: <CheckSquare className="h-4 w-4" />,
    action: (editor) =>
      editor.chain().focus().toggleTaskList().run(),
  },
  {
    name: "Quote",
    slug: "quote",
    description: "Block quote",
    icon: <Quote className="h-4 w-4" />,
    action: (editor) =>
      editor.chain().focus().toggleBlockquote().run(),
  },
  {
    name: "Divider",
    slug: "divider",
    description: "Horizontal rule",
    icon: <Minus className="h-4 w-4" />,
    action: (editor) =>
      editor.chain().focus().setHorizontalRule().run(),
  },
  {
    name: "Code",
    slug: "code",
    description: "Code block",
    icon: <Code2 className="h-4 w-4" />,
    action: (editor) =>
      editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    name: "Image",
    slug: "image",
    description: "Upload or embed an image",
    icon: <ImageIcon className="h-4 w-4" />,
    action: (editor, onImageUpload) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
          alert('Image is too large. Maximum size is 10MB.');
          return;
        }
        if (onImageUpload) {
          const url = await onImageUpload(file);
          if (url) {
            editor.chain().focus().setImage({ src: url }).run();
          }
        } else {
          const reader = new FileReader();
          reader.onload = () => {
            editor.chain().focus().setImage({ src: reader.result as string }).run();
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    },
  },
  {
    name: "Callout",
    slug: "callout",
    description: "Highlighted info box",
    icon: <AlertCircle className="h-4 w-4" />,
    action: (editor) =>
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'callout',
          attrs: { type: 'info' },
          content: [{ type: 'paragraph' }],
        })
        .run(),
  },
];

export default function SlashCommandMenu({ editor, onImageUpload }: SlashCommandMenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [slashPos, setSlashPos] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Stable ids so the editor's contenteditable element can reference the
  // listbox (aria-controls) and the active option (aria-activedescendant).
  const listboxId = useId();
  const optionId = useCallback(
    (index: number) => `${listboxId}-option-${index}`,
    [listboxId]
  );

  const filteredCommands = COMMANDS.filter((cmd) =>
    cmd.name.toLowerCase().includes(query.toLowerCase())
  );

  const closeMenu = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelectedIndex(0);
    setSlashPos(null);
  }, []);

  const executeCommand = useCallback(
    (cmd: CommandItem) => {
      if (slashPos !== null) {
        // Delete the slash and query text
        const to = editor.state.selection.from;
        editor
          .chain()
          .focus()
          .deleteRange({ from: slashPos, to })
          .run();
      }
      cmd.action(editor, onImageUpload);
      track("note_slash_command_used", { command: cmd.slug });
      closeMenu();
    },
    [editor, slashPos, closeMenu, onImageUpload]
  );

  // Listen to editor updates to detect "/"
  useEffect(() => {
    const handleUpdate = () => {
      const { state } = editor;
      const { from } = state.selection;
      const textBefore = state.doc.textBetween(
        Math.max(0, from - 50),
        from,
        "\n"
      );

      const slashMatch = textBefore.match(/\/([^\s/]*)$/);
      if (slashMatch) {
        const matchStart = from - slashMatch[0].length;
        // Only trigger if slash is at start of line or after whitespace
        const charBeforeSlash =
          matchStart > 0
            ? state.doc.textBetween(matchStart - 1, matchStart)
            : "";
        if (
          matchStart === 0 ||
          charBeforeSlash === "\n" ||
          charBeforeSlash === " " ||
          charBeforeSlash === ""
        ) {
          const coords = editor.view.coordsAtPos(from);
          const editorRect = editor.view.dom.getBoundingClientRect();
          setPosition({
            top: coords.bottom - editorRect.top + 4,
            left: coords.left - editorRect.left,
          });
          setQuery(slashMatch[1]);
          setSlashPos(matchStart);
          setSelectedIndex(0);
          setOpen(true);
          return;
        }
      }

      if (open) {
        closeMenu();
      }
    };

    editor.on("update", handleUpdate);
    editor.on("selectionUpdate", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
      editor.off("selectionUpdate", handleUpdate);
    };
  }, [editor, open, closeMenu]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredCommands.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredCommands.length - 1
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          executeCommand(filteredCommands[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [open, selectedIndex, filteredCommands, executeCommand, closeMenu]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, closeMenu]);

  // Scroll selected item into view
  useEffect(() => {
    if (!open || !menuRef.current) return;
    const selected = menuRef.current.querySelector(
      `[data-index="${selectedIndex}"]`
    );
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, open]);

  // Expose combobox semantics on the editor's contenteditable element.
  // The editor keeps DOM focus while this menu is open (keydown is driven by a
  // document-level listener), so we point assistive tech at the active option
  // via aria-activedescendant and announce the open listbox via aria-controls /
  // aria-expanded. Attributes are removed on close/unmount so the editor is a
  // plain textbox the rest of the time.
  useEffect(() => {
    const dom = editor.view?.dom as HTMLElement | undefined;
    if (!dom) return;

    const clear = () => {
      dom.removeAttribute("role");
      dom.removeAttribute("aria-expanded");
      dom.removeAttribute("aria-controls");
      dom.removeAttribute("aria-activedescendant");
      dom.removeAttribute("aria-haspopup");
    };

    if (!open || filteredCommands.length === 0) {
      clear();
      return clear;
    }

    dom.setAttribute("role", "combobox");
    dom.setAttribute("aria-haspopup", "listbox");
    dom.setAttribute("aria-expanded", "true");
    dom.setAttribute("aria-controls", listboxId);
    dom.setAttribute("aria-activedescendant", optionId(selectedIndex));

    return clear;
  }, [editor, open, filteredCommands.length, selectedIndex, listboxId, optionId]);

  if (!open || filteredCommands.length === 0) return null;

  return (
    <div
      ref={menuRef}
      id={listboxId}
      role="listbox"
      aria-label="Insert block"
      aria-activedescendant={optionId(selectedIndex)}
      className="absolute z-50 bg-overlay-scrim/90 backdrop-blur-md border border-foreground/10 rounded-lg shadow-2xl py-1 w-64 max-h-72 overflow-y-auto"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      {filteredCommands.map((cmd, index) => (
        <button
          key={cmd.name}
          type="button"
          id={optionId(index)}
          role="option"
          aria-selected={index === selectedIndex}
          data-index={index}
          onClick={() => executeCommand(cmd)}
          onMouseEnter={() => setSelectedIndex(index)}
          className={`w-full px-3 py-2 flex items-center gap-3 rounded cursor-pointer text-left transition-colors ${
            index === selectedIndex
              ? "bg-foreground/10"
              : "hover:bg-foreground/5"
          }`}
        >
          <span className="text-foreground/60 flex-shrink-0" aria-hidden="true">{cmd.icon}</span>
          <div className="min-w-0">
            <div className="text-sm text-foreground/90">{cmd.name}</div>
            <div className="text-xs text-foreground/40 truncate">
              {cmd.description}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
