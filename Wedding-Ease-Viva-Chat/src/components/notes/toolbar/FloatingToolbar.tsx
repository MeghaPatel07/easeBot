import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Highlighter,
  Link,
  Heading1,
  Heading2,
  Heading3,
  Palette,
} from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

interface FloatingToolbarProps {
  editor: Editor;
}

const HIGHLIGHT_COLORS = [
  { name: "Yellow", color: "#fde68a" },
  { name: "Green", color: "#6ee7b7" },
  { name: "Blue", color: "#93c5fd" },
  { name: "Pink", color: "#f9a8d4" },
  { name: "Purple", color: "#c4b5fd" },
];

const TEXT_COLORS = [
  { name: "Default", color: "" },
  { name: "Gold", color: "#C6944A" },
  { name: "Red", color: "#ef4444" },
  { name: "Green", color: "#22c55e" },
  { name: "Blue", color: "#3b82f6" },
  { name: "Purple", color: "#a855f7" },
  { name: "Yellow", color: "#eab308" },
];

function ToolbarButton({
  onClick,
  isActive,
  children,
  title,
}: {
  onClick: () => void;
  isActive?: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`h-7 w-7 rounded flex items-center justify-center transition-colors ${
        isActive
          ? "bg-[#C6944A]/20 text-[#C6944A]"
          : "text-white/70 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

export default function FloatingToolbar({ editor }: FloatingToolbarProps) {
  const [linkUrl, setLinkUrl] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);

  const applyLink = () => {
    let url = linkUrl.trim();
    if (url) {
      // Prepend https:// if no protocol
      if (!/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
      }
      // Basic URL plausibility check
      try {
        new URL(url);
      } catch {
        alert('Please enter a valid URL.');
        return;
      }
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: url })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    }
    setLinkUrl("");
    setLinkOpen(false);
  };

  return (
    <BubbleMenu
      editor={editor}
      options={{
        placement: "top",
      }}
      className="bg-black/80 backdrop-blur-md border border-white/10 rounded-lg shadow-xl p-1 flex items-center gap-0.5"
    >
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        title="Bold"
      >
        <Bold className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        title="Italic"
      >
        <Italic className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive("underline")}
        title="Underline"
      >
        <Underline className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive("strike")}
        title="Strikethrough"
      >
        <Strikethrough className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive("code")}
        title="Code"
      >
        <Code className="h-3.5 w-3.5" />
      </ToolbarButton>

      <div className="w-px h-5 bg-white/10 mx-0.5" />

      {/* Highlight color picker */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Highlight"
            className={`h-7 w-7 rounded flex items-center justify-center transition-colors ${
              editor.isActive("highlight")
                ? "bg-[#C6944A]/20 text-[#C6944A]"
                : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Highlighter className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto bg-black/90 backdrop-blur-md border-white/10 p-2"
          sideOffset={8}
        >
          <div className="flex gap-1">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.name}
                type="button"
                title={c.name}
                onClick={() =>
                  editor
                    .chain()
                    .focus()
                    .toggleHighlight({ color: c.color })
                    .run()
                }
                className="h-6 w-6 rounded border border-white/10 hover:scale-110 transition-transform"
                style={{ backgroundColor: c.color }}
              />
            ))}
            {editor.isActive("highlight") && (
              <button
                type="button"
                title="Remove highlight"
                onClick={() =>
                  editor.chain().focus().unsetHighlight().run()
                }
                className="h-6 px-2 rounded border border-white/10 text-white/60 text-xs hover:bg-white/10"
              >
                &times;
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Text color picker */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Text color"
            className="h-7 w-7 rounded flex items-center justify-center text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            <Palette className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto bg-black/90 backdrop-blur-md border-white/10 p-2"
          sideOffset={8}
        >
          <div className="flex gap-1">
            {TEXT_COLORS.map((c) => (
              <button
                key={c.name}
                type="button"
                title={c.name}
                onClick={() => {
                  if (c.color) {
                    editor.chain().focus().setColor(c.color).run();
                  } else {
                    editor.chain().focus().unsetColor().run();
                  }
                }}
                className="h-6 w-6 rounded border border-white/10 hover:scale-110 transition-transform flex items-center justify-center"
                style={{ backgroundColor: c.color || "transparent" }}
              >
                {!c.color && (
                  <span className="text-white/60 text-xs">A</span>
                )}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <div className="w-px h-5 bg-white/10 mx-0.5" />

      {/* Link */}
      <Popover open={linkOpen} onOpenChange={setLinkOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Link"
            onClick={() => {
              const existingHref = editor.getAttributes("link").href || "";
              setLinkUrl(existingHref);
              setLinkOpen(true);
            }}
            className={`h-7 w-7 rounded flex items-center justify-center transition-colors ${
              editor.isActive("link")
                ? "bg-[#C6944A]/20 text-[#C6944A]"
                : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Link className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-64 bg-black/90 backdrop-blur-md border-white/10 p-3"
          sideOffset={8}
        >
          <div className="flex flex-col gap-2">
            <input
              type="url"
              placeholder="https://..."
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyLink();
                }
              }}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-[#C6944A]/50"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={applyLink}
                className="flex-1 bg-[#C6944A] text-white text-xs py-1 rounded hover:bg-[#C6944A]/90 transition-colors"
              >
                Apply
              </button>
              {editor.isActive("link") && (
                <button
                  type="button"
                  onClick={() => {
                    editor
                      .chain()
                      .focus()
                      .extendMarkRange("link")
                      .unsetLink()
                      .run();
                    setLinkOpen(false);
                  }}
                  className="px-3 border border-white/10 text-white/60 text-xs py-1 rounded hover:bg-white/10 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <div className="w-px h-5 bg-white/10 mx-0.5" />

      {/* Headings */}
      <ToolbarButton
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 1 }).run()
        }
        isActive={editor.isActive("heading", { level: 1 })}
        title="Heading 1"
      >
        <Heading1 className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
        isActive={editor.isActive("heading", { level: 2 })}
        title="Heading 2"
      >
        <Heading2 className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
        isActive={editor.isActive("heading", { level: 3 })}
        title="Heading 3"
      >
        <Heading3 className="h-3.5 w-3.5" />
      </ToolbarButton>
    </BubbleMenu>
  );
}
