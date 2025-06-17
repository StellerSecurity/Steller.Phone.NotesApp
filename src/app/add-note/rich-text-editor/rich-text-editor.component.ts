import {
  Component,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  ElementRef,
  HostListener,
  AfterViewInit,
  OnDestroy,
  Renderer2
} from '@angular/core';
import { AngularEditorComponent, AngularEditorConfig } from '@wfpena/angular-wysiwyg';

@Component({
  selector: 'app-rich-text-editor',
  templateUrl: './rich-text-editor.component.html',
  styleUrls: ['./rich-text-editor.component.scss']
})
export class RichTextEditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('editorRef') editorComponent!: AngularEditorComponent;
  @ViewChild('editorWrapper') editorWrapper!: ElementRef;
  @Input() note_text: string = '';
  @Output() noteChange = new EventEmitter<string>();

  // Toolbar states
  public isBold = false;
  public isStrikeThrough = false;
  public isHeadingDropdownOpen = false;
  public isListActive = false;
  public isOrderedListActive = false;
  public currentHeading = '';
  private activeFormats: any= {
    bold: false,
    strikeThrough: false
  };
  private eventListeners: (() => void)[] = [];

  public editorConfig: AngularEditorConfig = {
    editable: true,
    spellcheck: false,
    height: '100vh',
    minHeight: '200px',
    maxHeight: 'auto',
    width: 'auto',
    minWidth: '0',
    translate: 'no',
    enableToolbar: false,
    showToolbar: false,
    placeholder: 'Enter your note here...',
    defaultParagraphSeparator: 'p',
    sanitize: true,
    toolbarPosition: 'top',
    outline: false
  };

  constructor(private renderer: Renderer2) {}

  ngAfterViewInit() {
    this.setupEditorListeners();
  }

  ngOnDestroy() {
    this.cleanupEventListeners();
  }

  private setupEditorListeners() {
    const editorElement = this.getEditorElement();
    if (!editorElement) return;

    // Track selection changes
    const selectionListener = this.renderer.listen(editorElement, 'mouseup', () => {
      this.updateToolbarState();
    });

    const keyupListener = this.renderer.listen(editorElement, 'keyup', () => {
      this.updateToolbarState();
      this.applyActiveFormats();
    });

    const clickListener = this.renderer.listen(editorElement, 'click', () => {
      this.updateToolbarState();
    });

    const focusListener = this.renderer.listen(editorElement, 'focus', () => {
      this.updateToolbarState();
    });

    this.eventListeners.push(selectionListener, keyupListener, clickListener, focusListener);
  }

  private cleanupEventListeners() {
    this.eventListeners.forEach(listener => listener());
    this.eventListeners = [];
  }

  private getEditorElement(): HTMLElement | null {
    return document.querySelector('angular-editor [contenteditable="true"]');
  }

  private focusEditor(): void {
    const editor = this.getEditorElement();
    if (editor) {
      editor.focus();
    }
  }

  private applyActiveFormats(): void {
    if (!this.getEditorElement()) return;

    Object.keys(this.activeFormats).forEach(format => {
      if (this.activeFormats[format]) {
        document.execCommand(format, false, '');
      }
    });
  }

  // Public methods for template binding
  toggleBold(): void {
    this.focusEditor();
    this.activeFormats.bold = !this.activeFormats.bold;
    document.execCommand('bold', false, '');
    this.updateToolbarState();
  }

  toggleStrikeThrough(): void {
    this.focusEditor();
    this.activeFormats.strikeThrough = !this.activeFormats.strikeThrough;
    document.execCommand('strikeThrough', false, '');
    this.updateToolbarState();
  }

  toggleHeadingDropdown(): void {
    this.isHeadingDropdownOpen = !this.isHeadingDropdownOpen;
    if (this.isHeadingDropdownOpen) {
      this.focusEditor();
    }
  }

  applyHeading(heading: string): void {
    this.focusEditor();
    const blockTag = heading === 'P' ? 'p' : heading.toLowerCase();
    document.execCommand('formatBlock', false, `<${blockTag}>`);
    this.isHeadingDropdownOpen = false;
    this.updateToolbarState();
  }

  toggleBulletList(): void {
    this.focusEditor();
    document.execCommand('insertUnorderedList', false, '');
    this.updateToolbarState();
  }

  toggleNumberedList(): void {
    this.focusEditor();
    document.execCommand('insertOrderedList', false, '');
    this.updateToolbarState();
  }

  insertLink(): void {
    this.focusEditor();
    const url = prompt('Enter URL:', 'https://');
    if (url) {
      document.execCommand('createLink', false, url);
    }
  }

  insertImage(): void {
    this.focusEditor();
    const imageUrl = prompt('Enter image URL:', 'https://');
    if (imageUrl) {
      document.execCommand('insertImage', false, imageUrl);
    }
  }

  undo(): void {
    this.focusEditor();
    document.execCommand('undo', false, '');
    this.updateToolbarState();
  }

  redo(): void {
    this.focusEditor();
    document.execCommand('redo', false, '');
    this.updateToolbarState();
  }

  updateToolbarState(): void {
    const editor = this.getEditorElement();
    if (!editor) return;

    this.isBold = document.queryCommandState('bold');
    this.isStrikeThrough = document.queryCommandState('strikeThrough');
    this.isListActive = document.queryCommandState('insertUnorderedList');
    this.isOrderedListActive = document.queryCommandState('insertOrderedList');
    
    // Update our active formats to match current state
    this.activeFormats.bold = this.isBold;
    this.activeFormats.strikeThrough = this.isStrikeThrough;

    // Detect current heading
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const node = selection.getRangeAt(0).startContainer.parentElement;
      if (node) {
        const tagName = node.nodeName.toLowerCase();
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
          this.currentHeading = tagName.toUpperCase();
          return;
        }
      }
    }
    this.currentHeading = '';
  }

  onContentChange(content: string): void {
    this.note_text = content;
    this.noteChange.emit(content);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.editorWrapper && !this.editorWrapper.nativeElement.contains(event.target)) {
      this.isHeadingDropdownOpen = false;
    }
  }
}