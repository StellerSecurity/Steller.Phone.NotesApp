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
export class RichTextEditorComponent implements AfterViewInit {
  @ViewChild('editorWrapper') editorWrapper!: ElementRef;
  @Input() note_text: string = '';
  @Output() noteChange = new EventEmitter<string>();
  updateNote:any = '';

  quillModules = {
    toolbar: [
      ['bold', 'italic', 'underline'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['link'],
      ['clean']
    ]
  };

  constructor(
    private renderer: Renderer2,
    private cdr: ChangeDetectorRef
  ) {
    this.updateNote = JSON.parse(JSON.stringify(this.note_text))
  }

  ngAfterViewInit() {

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
