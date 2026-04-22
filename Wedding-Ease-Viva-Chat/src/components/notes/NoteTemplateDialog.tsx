import React from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { NOTE_TEMPLATES } from '@/services/noteTemplates';
import type { NoteTemplate } from '@/types/notes';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export interface NoteTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  onSelectTemplate: (template: NoteTemplate) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Blank template fallback
// ─────────────────────────────────────────────────────────────────────────────
const BLANK_TEMPLATE: NoteTemplate = {
  id: 'blank',
  title: '',
  description: '',
  icon: '📝',
  category: 'general',
  content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
const NoteTemplateDialog: React.FC<NoteTemplateDialogProps> = ({
  open, onClose, onSelectTemplate,
}) => {
  const handleSelect = (template: NoteTemplate) => {
    onSelectTemplate(template);
    onClose();
  };

  const handleBlank = () => {
    onSelectTemplate(BLANK_TEMPLATE);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[560px] glass-panel rounded-2xl p-6 border border-foreground/[0.08] shadow-modal bg-card-elevated/90 backdrop-blur-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-headline text-xl text-foreground/90">
            Start from a template
          </DialogTitle>
          <DialogDescription className="text-foreground/40 text-sm">
            Choose a template to get started quickly with your wedding planning notes
          </DialogDescription>
        </DialogHeader>

        {/* Template grid — 3 columns on sm+, 2 on mobile */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto custom-scrollbar py-4 pr-1">
          {NOTE_TEMPLATES.map(template => (
            <button
              key={template.id}
              onClick={() => handleSelect(template)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-foreground/[0.08] hover:border-primary/30 bg-foreground/[0.03] hover:bg-foreground/[0.06] transition-all duration-200 text-center group"
            >
              <span className="text-2xl group-hover:scale-110 transition-transform">{template.icon}</span>
              <div>
                <p className="text-xs font-medium text-foreground/80 group-hover:text-foreground">{template.title}</p>
                <p className="text-[10px] text-foreground/30 mt-0.5 line-clamp-2">{template.description}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Blank note option */}
        <div className="border-t border-foreground/[0.06] pt-4 flex items-center justify-center">
          <Button
            onClick={handleBlank}
            variant="outline"
            className="gap-2 border-foreground/[0.08] text-foreground/50 hover:text-foreground/80 hover:bg-foreground/[0.06] rounded-full text-sm"
          >
            <FileText className="h-4 w-4" />
            Blank Note
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NoteTemplateDialog;
