import React, { useCallback, useEffect, useRef, useState } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Maximize2,
  Trash2,
  Download,
} from "lucide-react";

const MIN_WIDTH = 80;

export default function ResizableImageView({
  node,
  updateAttributes,
  deleteNode,
  selected,
  editor,
}: NodeViewProps) {
  const { src, alt, title, width, alignment } = node.attrs;
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const resizeSideRef = useRef<"left" | "right">("right");

  const isEditable = editor?.isEditable ?? false;

  // Show toolbar on hover OR when selected
  const toolbarVisible = isEditable && (showToolbar || selected) && !isResizing;

  // ── Pointer-based resize (mouse + touch) ──────────────────────────────────
  const onPointerDown = useCallback(
    (e: React.PointerEvent, side: "left" | "right") => {
      if (!isEditable) return;
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setIsResizing(true);
      startXRef.current = e.clientX;
      resizeSideRef.current = side;

      const img = imgRef.current;
      startWidthRef.current = img ? img.offsetWidth : (width ?? 400);
    },
    [isEditable, width]
  );

  useEffect(() => {
    if (!isResizing) return;

    const onPointerMove = (e: PointerEvent) => {
      const delta = e.clientX - startXRef.current;
      const direction = resizeSideRef.current === "right" ? 1 : -1;
      const newWidth = Math.max(MIN_WIDTH, startWidthRef.current + delta * direction);
      updateAttributes({ width: Math.round(newWidth) });
    };

    const onPointerUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [isResizing, updateAttributes]);

  // ── Alignment helper ──────────────────────────────────────────────────────
  const setAlignment = (align: "left" | "center" | "right") => {
    updateAttributes({ alignment: align });
  };

  // ── Download ──────────────────────────────────────────────────────────────
  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = src;
    a.download = alt || "image";
    a.target = "_blank";
    a.click();
  };

  // ── Full width toggle ────────────────────────────────────────────────────
  const toggleFullWidth = () => {
    if (width === "100%") {
      updateAttributes({ width: 400 });
    } else {
      updateAttributes({ width: "100%" });
    }
  };

  const justifyClass =
    alignment === "center"
      ? "justify-center"
      : alignment === "right"
      ? "justify-end"
      : "justify-start";

  const widthStyle =
    width === "100%"
      ? { width: "100%" }
      : typeof width === "number"
      ? { width: `${width}px` }
      : {};

  return (
    <NodeViewWrapper
      className={`flex my-2 ${justifyClass}`}
      data-drag-handle
    >
      <div
        ref={containerRef}
        className={`relative group inline-block ${
          selected ? "ring-2 ring-[#A17A63] ring-offset-1 ring-offset-transparent rounded-lg" : ""
        }`}
        style={widthStyle}
        onMouseEnter={() => setShowToolbar(true)}
        onMouseLeave={() => {
          if (!isResizing) setShowToolbar(false);
        }}
      >
        {/* Image */}
        <img
          ref={imgRef}
          src={src}
          alt={alt || ""}
          title={title || ""}
          className="block w-full rounded-lg select-none"
          draggable={false}
        />

        {/* Resize handles — left and right edges */}
        {isEditable && (
          <>
            {/* Left handle */}
            <div
              className="absolute left-0 top-0 bottom-0 w-4 cursor-col-resize flex items-center justify-center opacity-0 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
              style={{ touchAction: "none" }}
              onPointerDown={(e) => onPointerDown(e, "left")}
            >
              <div className="w-1 h-10 max-h-[40%] rounded-full bg-white/70 shadow-md" />
            </div>
            {/* Right handle */}
            <div
              className="absolute right-0 top-0 bottom-0 w-4 cursor-col-resize flex items-center justify-center opacity-0 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
              style={{ touchAction: "none" }}
              onPointerDown={(e) => onPointerDown(e, "right")}
            >
              <div className="w-1 h-10 max-h-[40%] rounded-full bg-white/70 shadow-md" />
            </div>
          </>
        )}

        {/* Toolbar — overlay inside the image at top */}
        {toolbarVisible && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-black/80 backdrop-blur-sm border border-white/10 rounded-lg px-1 py-0.5 shadow-xl z-50">
            <ToolbarButton
              active={alignment === "left"}
              onClick={() => setAlignment("left")}
              title="Align left"
            >
              <AlignLeft className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              active={alignment === "center"}
              onClick={() => setAlignment("center")}
              title="Align center"
            >
              <AlignCenter className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              active={alignment === "right"}
              onClick={() => setAlignment("right")}
              title="Align right"
            >
              <AlignRight className="h-3.5 w-3.5" />
            </ToolbarButton>

            <div className="w-px h-4 bg-white/20 mx-0.5" />

            <ToolbarButton onClick={toggleFullWidth} title="Full width">
              <Maximize2 className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={handleDownload} title="Download">
              <Download className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              onClick={deleteNode}
              title="Delete"
              className="hover:!bg-red-500/30 hover:!text-red-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </ToolbarButton>
          </div>
        )}

        {/* Resize cursor overlay while dragging */}
        {isResizing && (
          <div className="fixed inset-0 z-[9999] cursor-col-resize" />
        )}
      </div>
    </NodeViewWrapper>
  );
}

// ── Small toolbar button ──────────────────────────────────────────────────
function ToolbarButton({
  children,
  onClick,
  active,
  title,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md transition-colors ${
        active
          ? "bg-[#A17A63]/30 text-[#A17A63]"
          : "text-white/60 hover:bg-white/10 hover:text-white"
      } ${className}`}
    >
      {children}
    </button>
  );
}
