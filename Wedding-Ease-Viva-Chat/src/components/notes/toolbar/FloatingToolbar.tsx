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
import FontSizeControl from "./FontSizeControl";
import { track } from "@/lib/analytics";

type FormatName =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "code"
  | "link"
  | "h1"
  | "h2"
  | "h3";

function fireFormat(format: FormatName) {
  track("note_formatting_applied", { format });
}

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
  { name: "Bronze", color: "#A17A63" },
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
      className={`h-7 w-7 flex-shrink-0 rounded flex items-center justify-center transition-colors ${
        isActive
          ? "bg-primary/20 text-primary"
          : "text-overlay-text/70 hover:bg-overlay-surface/10 hover:text-overlay-text"
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
      fireFormat("link");
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
      className="bg-overlay-scrim/80 backdrop-blur-md border border-overlay-border/10 rounded-lg shadow-xl p-1 flex flex-nowrap items-center gap-0.5 max-w-[calc(100vw-1rem)] overflow-x-auto scrollbar-hide"
    >
      <ToolbarButton
        onClick={() => {
          editor.chain().focus().toggleBold().run();
          fireFormat("bold");
        }}
        isActive={editor.isActive("bold")}
        title="Bold"
      >
        <Bold className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => {
          editor.chain().focus().toggleItalic().run();
          fireFormat("italic");
        }}
        isActive={editor.isActive("italic")}
        title="Italic"
      >
        <Italic className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => {
          editor.chain().focus().toggleUnderline().run();
          fireFormat("underline");
        }}
        isActive={editor.isActive("underline")}
        title="Underline"
      >
        <Underline className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => {
          editor.chain().focus().toggleStrike().run();
          fireFormat("strike");
        }}
        isActive={editor.isActive("strike")}
        title="Strikethrough"
      >
        <Strikethrough className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => {
          editor.chain().focus().toggleCode().run();
          fireFormat("code");
        }}
        isActive={editor.isActive("code")}
        title="Code"
      >
        <Code className="h-3.5 w-3.5" />
      </ToolbarButton>

      <div className="w-px h-5 flex-shrink-0 bg-overlay-surface/10 mx-0.5" />

      {/* Highlight color picker */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Highlight"
            className={`h-7 w-7 flex-shrink-0 rounded flex items-center justify-center transition-colors ${
              editor.isActive("highlight")
                ? "bg-primary/20 text-primary"
                : "text-overlay-text/70 hover:bg-overlay-surface/10 hover:text-overlay-text"
            }`}
          >
            <Highlighter className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto bg-overlay-scrim/90 backdrop-blur-md border-overlay-border/10 p-2"
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
                className="h-6 w-6 rounded border border-overlay-border/10 hover:scale-110 transition-transform"
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
                className="h-6 px-2 rounded border border-overlay-border/10 text-overlay-text/60 text-xs hover:bg-overlay-surface/10"
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
            className="h-7 w-7 flex-shrink-0 rounded flex items-center justify-center text-overlay-text/70 hover:bg-overlay-surface/10 hover:text-overlay-text transition-colors"
          >
            <Palette className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto bg-overlay-scrim/90 backdrop-blur-md border-overlay-border/10 p-2"
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
                className="h-6 w-6 rounded border border-overlay-border/10 hover:scale-110 transition-transform flex items-center justify-center"
                style={{ backgroundColor: c.color || "transparent" }}
              >
                {!c.color && (
                  <span className="text-overlay-text/60 text-xs">A</span>
                )}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Font size control — Google-Docs-style numeric stepper + preset dropdown */}
      <FontSizeControl editor={editor} variant="overlay" />

      <div className="w-px h-5 flex-shrink-0 bg-overlay-surface/10 mx-0.5" />

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
            className={`h-7 w-7 flex-shrink-0 rounded flex items-center justify-center transition-colors ${
              editor.isActive("link")
                ? "bg-primary/20 text-primary"
                : "text-overlay-text/70 hover:bg-overlay-surface/10 hover:text-overlay-text"
            }`}
          >
            <Link className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-64 bg-overlay-scrim/90 backdrop-blur-md border-overlay-border/10 p-3"
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
              className="w-full bg-overlay-surface/5 border border-overlay-border/10 rounded px-2 py-1.5 text-sm text-overlay-text placeholder:text-overlay-text/30 outline-none focus:border-primary/50"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={applyLink}
                className="flex-1 bg-primary text-primary-foreground text-xs py-1 rounded hover:bg-primary/90 transition-colors"
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
                  className="px-3 border border-overlay-border/10 text-overlay-text/60 text-xs py-1 rounded hover:bg-overlay-surface/10 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <div className="w-px h-5 flex-shrink-0 bg-overlay-surface/10 mx-0.5" />

      {/* Headings */}
      <ToolbarButton
        onClick={() => {
          editor.chain().focus().toggleHeading({ level: 1 }).run();
          fireFormat("h1");
        }}
        isActive={editor.isActive("heading", { level: 1 })}
        title="Heading 1"
      >
        <Heading1 className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => {
          editor.chain().focus().toggleHeading({ level: 2 }).run();
          fireFormat("h2");
        }}
        isActive={editor.isActive("heading", { level: 2 })}
        title="Heading 2"
      >
        <Heading2 className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => {
          editor.chain().focus().toggleHeading({ level: 3 }).run();
          fireFormat("h3");
        }}
        isActive={editor.isActive("heading", { level: 3 })}
        title="Heading 3"
      >
        <Heading3 className="h-3.5 w-3.5" />
      </ToolbarButton>
    </BubbleMenu>
  );
}
