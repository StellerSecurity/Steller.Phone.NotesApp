import { OnInit } from '@angular/core';
import {
  Component,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  ElementRef,
  ChangeDetectorRef,
  AfterViewInit,
  Renderer2
} from '@angular/core';


@Component({
  selector: 'app-rich-text-editor',
  templateUrl: './rich-text-editor.component.html',
  styleUrls: ['./rich-text-editor.component.scss']
})
export class RichTextEditorComponent implements OnInit, AfterViewInit {
  @ViewChild('editorWrapper') editorWrapper!: ElementRef;
  @Input() note_text: string = '';
  @Output() noteChange = new EventEmitter<string>();
  updateNote:any = '';

  quillModules: any;

  quill: any;

  constructor(
    private renderer: Renderer2,
    private cdr: ChangeDetectorRef
  ) {
    this.updateNote = JSON.parse(JSON.stringify(this.note_text))
  }


  ngOnInit() {
    this.quillModules = {
      toolbar: {
        container: '#custom-toolbar',
        handlers: {
          undo: () => {
            this.quill?.history.undo();
          },
          redo: () => {
            this.quill?.history.redo();
          }
        }
      },
      history: {
        delay: 1000,
        maxStack: 500,
        userOnly: true
      }
    };
  }

  ngAfterViewInit() {

  }

  onEditorCreated(quillInstance: any) {
    this.quill = quillInstance;

    // Custom Undo
    const toolbar = quillInstance.getModule('toolbar');

    toolbar.addHandler('undo', () => {
      quillInstance.history.undo();
    });

    toolbar.addHandler('redo', () => {
      quillInstance.history.redo();
    });
  }

  onContentChange(content: string): void {
    this.note_text = content;
    this.noteChange.emit(content);
    // this.updateNote = content;
  }


  onLeave() {
    // Add cleanup or save logic here
    // this.noteChange.emit(this.updateNote);
  }
}
