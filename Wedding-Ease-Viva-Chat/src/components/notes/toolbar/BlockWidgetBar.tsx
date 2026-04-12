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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface BlockWidget {
  name: string;
  shortcut: string;
  icon: React.ReactNode;
  action: (editor: Editor, onImageUpload?: (file: File) => Promise<string | null>) => void;
}

const WIDGETS: BlockWidget[] = [
  {
    name: "Text",
    shortcut: "/text",
    icon: <AlignLeft className="h-4 w-4" />,
    action: (editor) => editor.chain().focus().setParagraph().run(),
  },
  {
    name: "Heading 1",
    shortcut: "/h1",
    icon: <Heading1 className="h-4 w-4" />,
    action: (editor) =>
      editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    name: "Heading 2",
    shortcut: "/h2",
    icon: <Heading2 className="h-4 w-4" />,
    action: (editor) =>
      editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    name: "Heading 3",
    shortcut: "/h3",
    icon: <Heading3 className="h-4 w-4" />,
    action: (editor) =>
      editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    name: "Bullet List",
    shortcut: "/bullet",
    icon: <List className="h-4 w-4" />,
    action: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    name: "Numbered List",
    shortcut: "/numbered",
    icon: <ListOrdered className="h-4 w-4" />,
    action: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    name: "To-do",
    shortcut: "/todo",
    icon: <CheckSquare className="h-4 w-4" />,
    action: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    name: "Quote",
    shortcut: "/quote",
    icon: <Quote className="h-4 w-4" />,
    action: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    name: "Divider",
    shortcut: "/divider",
    icon: <Minus className="h-4 w-4" />,
    action: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    name: "Code",
    shortcut: "/code",
    icon: <Code2 className="h-4 w-4" />,
    action: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    name: "Image",
    shortcut: "/image",
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
    shortcut: "/callout",
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

interface BlockWidgetBarProps {
  editor: Editor;
  onImageUpload?: (file: File) => Promise<string | null>;
}

export default function BlockWidgetBar({ editor, onImageUpload }: BlockWidgetBarProps) {
  return (
    <div className="flex items-center gap-1 flex-wrap px-1 py-2 border-t border-white/10 bg-black/30 backdrop-blur-sm rounded-b-lg">
      <span className="text-[10px] uppercase tracking-wider text-white/30 font-medium px-2 mr-1 select-none">
        Insert
      </span>
      {WIDGETS.map((widget) => (
        <Tooltip key={widget.name}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => widget.action(editor, onImageUpload)}
              className="group flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-white/[0.06] bg-white/[0.03] hover:bg-primary/10 hover:border-primary/30 transition-all text-white/50 hover:text-primary"
            >
              <span className="flex-shrink-0">{widget.icon}</span>
              <span className="text-[11px] font-medium hidden sm:inline">
                {widget.name}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="bg-black/90 border-white/10 text-white text-xs"
          >
            <span>{widget.name}</span>
            <span className="ml-2 text-white/40 font-mono">{widget.shortcut}</span>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
