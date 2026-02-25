import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-rich-text-editor',
  templateUrl: './rich-text-editor.component.html',
  styleUrls: ['./rich-text-editor.component.scss']
})
export class RichTextEditorComponent {

  @Input() note_text: string = '';
  @Output() noteChange = new EventEmitter<string>();

  quill: any;

  // Production-safe configuration
  quillModules = {
    toolbar: {
      container: '#custom-toolbar',
      handlers: {
        undo: () => this.quill?.history.undo(),
        redo: () => this.quill?.history.redo()
      }
    },
    history: {
      delay: 0,
      maxStack: 300,
      userOnly: true
    }
  };

  onEditorCreated(quillInstance: any) {
    this.quill = quillInstance;
  }

  onContentChange(content: string) {
    this.note_text = content;
    this.noteChange.emit(content);
  }
}
