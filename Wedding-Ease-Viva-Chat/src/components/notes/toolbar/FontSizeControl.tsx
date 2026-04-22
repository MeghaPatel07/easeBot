import { useState, useEffect, useCallback } from "react";
import type { Editor } from "@tiptap/react";
import { Minus, Plus, ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { track } from "@/lib/analytics";

const FONT_SIZE_PRESETS: { label: string; value: number }[] = [
  { label: "Small", value: 12 },
  { label: "Normal", value: 14 },
  { label: "Medium", value: 16 },
  { label: "Large", value: 18 },
  { label: "XL", value: 20 },
  { label: "2XL", value: 24 },
  { label: "3XL", value: 28 },
  { label: "4XL", value: 32 },
  { label: "5XL", value: 40 },
  { label: "6XL", value: 48 },
];

const MIN_SIZE = 8;
const MAX_SIZE = 96;
const DEFAULT_DISPLAY = "14";

function readCurrentSize(editor: Editor): string {
  const fs = editor.getAttributes("textStyle")?.fontSize as
    | string
    | undefined;
  if (!fs) return "";
  const n = parseInt(fs, 10);
  return Number.isFinite(n) ? String(n) : "";
}

interface FontSizeControlProps {
  editor: Editor;
  /** Use surface colors for bubble menu (dark) vs inline toolbar (theme-aware). */
  variant?: "overlay" | "inline";
}

export default function FontSizeControl({
  editor,
  variant = "inline",
}: FontSizeControlProps) {
  const [display, setDisplay] = useState<string>(() => readCurrentSize(editor));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = () => setDisplay(readCurrentSize(editor));
    editor.on("selectionUpdate", sync);
    editor.on("transaction", sync);
    return () => {
      editor.off("selectionUpdate", sync);
      editor.off("transaction", sync);
    };
  }, [editor]);

  const apply = useCallback(
    (size: number) => {
      const clamped = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(size)));
      (editor as unknown as {
        chain: () => { focus: () => { setFontSize: (v: string) => { run: () => void } } };
      })
        .chain()
        .focus()
        .setFontSize(`${clamped}px`)
        .run();
      track("note_font_size_changed", { size: clamped });
    },
    [editor],
  );

  const reset = useCallback(() => {
    (editor as unknown as {
      chain: () => { focus: () => { unsetFontSize: () => { run: () => void } } };
    })
      .chain()
      .focus()
      .unsetFontSize()
      .run();
  }, [editor]);

  const parseDisplay = (): number =>
    parseInt(display || DEFAULT_DISPLAY, 10) || parseInt(DEFAULT_DISPLAY, 10);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplay(e.target.value.replace(/[^0-9]/g, "").slice(0, 3));
  };

  const commit = () => {
    if (!display) {
      reset();
      return;
    }
    const n = parseInt(display, 10);
    if (Number.isFinite(n) && n > 0) apply(n);
    else setDisplay(readCurrentSize(editor));
  };

  const isOverlay = variant === "overlay";
  const buttonClass = isOverlay
    ? "h-7 w-6 flex items-center justify-center rounded text-overlay-text/70 hover:bg-overlay-surface/10 hover:text-overlay-text transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
    : "h-7 w-6 flex items-center justify-center rounded-md border border-foreground/[0.06] bg-foreground/[0.03] [.light_&]:bg-background [.light_&]:border-border hover:bg-primary/10 hover:border-primary/30 text-foreground/50 [.light_&]:text-foreground/75 hover:text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed";
  const inputClass = isOverlay
    ? "h-7 w-9 bg-overlay-surface/5 border border-overlay-border/10 text-overlay-text text-center text-[11px] outline-none rounded focus:border-primary/50"
    : "h-7 w-10 bg-foreground/[0.03] [.light_&]:bg-background border border-foreground/[0.06] [.light_&]:border-border text-foreground/80 text-center text-[11px] outline-none rounded-md focus:border-primary/50";
  const caretBtnClass = isOverlay
    ? "h-7 w-5 flex items-center justify-center rounded text-overlay-text/70 hover:bg-overlay-surface/10 hover:text-overlay-text transition-colors"
    : "h-7 w-5 flex items-center justify-center rounded-md text-foreground/40 hover:text-primary transition-colors";

  const currentNum = parseDisplay();

  return (
    <div className="inline-flex items-center gap-0.5 flex-shrink-0" role="group" aria-label="Font size">
      <button
        type="button"
        title="Decrease font size"
        aria-label="Decrease font size"
        onClick={() => apply(currentNum - 1)}
        disabled={currentNum <= MIN_SIZE}
        className={buttonClass}
      >
        <Minus className="h-3 w-3" />
      </button>

      <div className="inline-flex items-center">
        <input
          type="text"
          inputMode="numeric"
          value={display}
          onChange={onInputChange}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
              (e.currentTarget as HTMLInputElement).blur();
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              apply(currentNum + 1);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              apply(currentNum - 1);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setDisplay(readCurrentSize(editor));
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          onBlur={commit}
          onFocus={(e) => e.currentTarget.select()}
          placeholder="14"
          className={inputClass}
          aria-label="Font size in pixels"
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Font size presets"
              aria-label="Open font size presets"
              className={caretBtnClass}
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="center"
            sideOffset={6}
            className={
              isOverlay
                ? "w-auto bg-overlay-scrim/90 backdrop-blur-md border-overlay-border/10 p-1"
                : "w-auto bg-card border-border p-1 shadow-dropdown"
            }
          >
            <div className="flex flex-col gap-0.5 min-w-[120px] max-h-[260px] overflow-y-auto">
              <button
                type="button"
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
                className={
                  isOverlay
                    ? "px-2 py-1 text-left text-[11px] rounded text-overlay-text/60 hover:bg-overlay-surface/10 hover:text-overlay-text transition-colors"
                    : "px-2 py-1 text-left text-[11px] rounded text-foreground/60 hover:bg-foreground/10 hover:text-foreground transition-colors"
                }
              >
                Default
              </button>
              {FONT_SIZE_PRESETS.map((fs) => (
                <button
                  key={fs.value}
                  type="button"
                  onClick={() => {
                    apply(fs.value);
                    setOpen(false);
                  }}
                  className={
                    isOverlay
                      ? "flex items-center justify-between px-2 py-1 text-left text-[11px] rounded text-overlay-text/60 hover:bg-overlay-surface/10 hover:text-overlay-text transition-colors"
                      : "flex items-center justify-between px-2 py-1 text-left text-[11px] rounded text-foreground/60 hover:bg-foreground/10 hover:text-foreground transition-colors"
                  }
                >
                  <span>{fs.label}</span>
                  <span
                    className={
                      isOverlay
                        ? "text-overlay-text/30 ml-3"
                        : "text-foreground/30 ml-3"
                    }
                  >
                    {fs.value}px
                  </span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <button
        type="button"
        title="Increase font size"
        aria-label="Increase font size"
        onClick={() => apply(currentNum + 1)}
        disabled={currentNum >= MAX_SIZE}
        className={buttonClass}
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}
