import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import {
  AngularEditorComponent,
  AngularEditorConfig,
} from '@wfpena/angular-wysiwyg';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-rich-text-editor',
  templateUrl: './rich-text-editor.component.html',
  styleUrls: ['./rich-text-editor.component.scss'],
})
export class RichTextEditorComponent implements OnInit, OnDestroy {
  @ViewChild('editorRef') editorComponent?: AngularEditorComponent;
  @Input() note_text: any = '';
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
    enableToolbar: false,
    showToolbar: false,
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
      ['paragraph', 'blockquote', 'removeBlockquote', 'horizontalLine', 'unorderedList'],
      ['video', 'insertVideo', 'horizontalline', 'insertHorizontalRule', 'toggleEditorMode'],
      ['backgroundColor', 'foregroundColor', 'textColor'],
    ],
  };

  public isBold = false;
  public isStrikeThrough = false;
  public isHeadingDropdownOpen = false;
  private savedRange: Range | null = null;

  constructor(private router: Router) {}

  ngOnInit() {
    this.routerSubscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.autoSaveNote();
      }
    });
  }

  save(event: any): void {
    this.note_text = event;
    this.noteChange.emit(event);
  }

  ngOnDestroy() {
    this.routerSubscription?.unsubscribe();
  }

  private autoSaveNote() {
    this.noteChange.emit(this.note_text);
  }

  undo(): void {
    document.execCommand('undo');
  }
  
  redo(): void {
    document.execCommand('redo');
  }


  execCommand(command: string, value?: string) {
    const iframe = document.querySelector('angular-editor iframe') as HTMLIFrameElement;
    const iframeDoc = iframe?.contentWindow?.document;

    if (iframeDoc) {
      iframeDoc.execCommand(command, false, value);
      iframeDoc.body.focus(); // maintain focus in editor
    }

    this.updateToolbarState();
  }

  toggleHeadingDropdown() {
    const iframe = document.querySelector('angular-editor iframe') as HTMLIFrameElement;
    const iframeDoc = iframe?.contentWindow?.document;

    if (iframeDoc && iframeDoc.getSelection) {
      const sel = iframeDoc.getSelection();
      if (sel && sel.rangeCount > 0) {
        this.savedRange = sel.getRangeAt(0).cloneRange();
      }
    }

    this.isHeadingDropdownOpen = !this.isHeadingDropdownOpen;
  }

  applyHeading(heading: string) {
    const headingMap: any = {
      h1: 'Heading 1',
      h2: 'Heading 2',
      h3: 'Heading 3',
      h4: 'Heading 4',
      h5: 'Heading 5',
    };
    const commandValue = heading;

    const iframe = document.querySelector('angular-editor iframe') as HTMLIFrameElement;
    const iframeDoc = iframe?.contentWindow?.document;

    if (iframeDoc && this.savedRange) {
      const sel = iframeDoc.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(this.savedRange);

      iframeDoc.execCommand('formatBlock', false, commandValue);
      iframeDoc.body.focus();
    }

    this.savedRange = null;
    this.isHeadingDropdownOpen = false;
    this.updateToolbarState();
  }

  updateToolbarState() {
    const iframe = document.querySelector('angular-editor iframe') as HTMLIFrameElement;
    const iframeDoc = iframe?.contentWindow?.document;

    if (iframeDoc) {
      this.isBold = iframeDoc.queryCommandState('bold');
      this.isStrikeThrough = iframeDoc.queryCommandState('strikeThrough');
    }
  }

  exec(command: string, value: any = null) {
    document.execCommand(command, false, value);
  }
  
  insertLink(): void {
    const url = window.prompt('Enter URL');
    if (url) {
      document.execCommand('createLink', false, url);
    }
  }
  
  insertImage(): void {
    const imageUrl = window.prompt('Enter image URL');
    if (imageUrl) {
      document.execCommand('insertImage', false, imageUrl);
    }
  }

}
