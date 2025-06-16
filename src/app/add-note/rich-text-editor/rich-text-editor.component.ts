import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { AngularEditorComponent, AngularEditorConfig } from '@wfpena/angular-wysiwyg';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-rich-text-editor',
  templateUrl: './rich-text-editor.component.html',
  styleUrls: ['./rich-text-editor.component.scss'],
})
export class RichTextEditorComponent  implements OnInit, OnDestroy {
  @ViewChild('editorRef') editorComponent?: AngularEditorComponent;
  @Input() note_text:any = '';
  @Output() noteChange: EventEmitter<any> = new EventEmitter();
  private routerSubscription!: Subscription;

  public editorConfig: AngularEditorConfig = {
    editable: true,
    spellcheck: false,
    height: '100vh',
    minHeight: '0',
    maxHeight: 'auto',
    textAreaBackgroundColor: 'white',
    width: 'auto',
    minWidth: '0',
    translate: 'no',
    enableToolbar: true,
    showToolbar: true,
    placeholder: 'Enter your note here..',
    defaultParagraphSeparator: '',
    defaultFontName: '',
    defaultFontSize: '',
    imageResizeSensitivity: 3,
    uploadWithCredentials: false,
    sanitize: true,
    toolbarPosition: 'top',
    outline: false,
    toolbarHiddenButtons: [
      ['italic', 'underline', 'superscript', 'subscript'],
      ['fontName', 'fontSize', 'color'],
      ['justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull', 'indent', 'outdent'],
      ['cut', 'copy', 'delete', 'removeFormat'],
      ['paragraph', 'blockquote', 'removeBlockquote', 'horizontalLine',  'unorderedList'],
      ['video', 'insertVideo', 'horizontalline', 'insertHorizontalRule', 'toggleEditorMode'],
      ['backgroundColor', 'foregroundColor', 'textColor']
    ],
  };
  
  constructor(private router: Router) {}

  ngOnInit() {
    this.routerSubscription = this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        this.autoSaveNote();
      }
    });
  }

  save(event:any): void {
    this.note_text = event;
    this.noteChange.emit(event);
  }

  ngOnDestroy() {
    this.routerSubscription?.unsubscribe();
  }

  private autoSaveNote() {
    this.noteChange.emit(this.note_text);
  }
}
