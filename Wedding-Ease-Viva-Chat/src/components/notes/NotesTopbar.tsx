import React, { useState } from 'react';
import { ArrowLeft, ChevronDown, FileText, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import NotesSidebar, { NotesSidebarProps } from '@/components/notes/NotesSidebar';

interface NotesTopbarProps extends NotesSidebarProps {
  activeNoteTitle: string | null;
}

export default function NotesTopbar(props: NotesTopbarProps) {
  const { activeNoteTitle, onBack, onCreateNote, onSelectNote, ...sidebarProps } = props;
  const [open, setOpen] = useState(false);

  const handleSelect = (noteId: string) => {
    onSelectNote(noteId);
    setOpen(false);
  };

  const handleCreate = (folderId?: string) => {
    onCreateNote(folderId);
    setOpen(false);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/80 backdrop-blur-md flex-shrink-0">
      <Button
        onClick={onBack}
        variant="ghost"
        className="h-8 w-8 rounded-full hover:bg-foreground/10 text-foreground/70 flex-shrink-0"
        title="Back"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm hover:bg-foreground/10 text-foreground/80 transition-colors min-w-0"
          >
            <FileText className="h-3.5 w-3.5 text-primary/70 flex-shrink-0" />
            <span className="truncate font-medium">
              {activeNoteTitle || 'My Notes'}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-foreground/50 flex-shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-64 p-0 border-border bg-card shadow-dropdown [&>div]:!w-full"
        >
          <div className="h-[min(70vh,36rem)] flex flex-col">
            <NotesSidebar
              {...sidebarProps}
              onSelectNote={handleSelect}
              onCreateNote={handleCreate}
              onBack={() => setOpen(false)}
            />
          </div>
        </PopoverContent>
      </Popover>

      <div className="flex-1" />

      <Button
        onClick={() => onCreateNote()}
        variant="ghost"
        className="h-8 gap-1.5 rounded-lg hover:bg-foreground/10 text-foreground/70 text-xs px-2.5 flex-shrink-0"
        title="New note"
      >
        <Plus className="h-3.5 w-3.5" />
        <span>New</span>
      </Button>
    </div>
  );
}
