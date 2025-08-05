import {
  Component,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  ElementRef,
  ChangeDetectorRef,
  AfterViewInit,
  Renderer2,
} from "@angular/core";
import {
  AngularEditorComponent,
  AngularEditorConfig,
} from "@wfpena/angular-wysiwyg";
import { NotesService } from "src/app/services/notes.service";

@Component({
  selector: "app-rich-text-editor",
  templateUrl: "./rich-text-editor.component.html",
  styleUrls: ["./rich-text-editor.component.scss"],
})
export class RichTextEditorComponent implements AfterViewInit {
  @ViewChild("editorRef") editorComponent!: AngularEditorComponent;
  @ViewChild("editorWrapper") editorWrapper!: ElementRef;
  @Input() note_text: string = "";
  @Output() noteChange = new EventEmitter<string>();
  updateNote: any = "";
  public editorConfig: AngularEditorConfig = {
    editable: true,
    spellcheck: false,
    height: "100vh",
    minHeight: "0",
    maxHeight: "auto",
    textAreaBackgroundColor: "white",
    width: "auto",
    minWidth: "0",
    translate: "no",
    enableToolbar: true,
    showToolbar: true,
    placeholder: "Enter your note here..",
    defaultParagraphSeparator: "",
    defaultFontName: "",
    defaultFontSize: "",
    imageResizeSensitivity: 3,
    uploadWithCredentials: false,
    sanitize: true,
    toolbarPosition: "top",
    outline: false,
    toolbarHiddenButtons: [
      ["italic", "underline", "superscript", "subscript"],
      ["fontName", "fontSize", "color"],
      [
        "justifyLeft",
        "justifyCenter",
        "justifyRight",
        "justifyFull",
        "indent",
        "outdent",
      ],
      ["cut", "copy", "delete", "removeFormat"],
      [
        "paragraph",
        "blockquote",
        "removeBlockquote",
        "horizontalLine",
        "unorderedList",
      ],
      [
        "video",
        "insertVideo",
        "horizontalline",
        "insertHorizontalRule",
        "toggleEditorMode",
      ],
      ["backgroundColor", "foregroundColor", "textColor"],
      ["unlink"],
    ],
  };

  constructor(
    private renderer: Renderer2,
    private cdr: ChangeDetectorRef,
    private noteService: NotesService
  ) {
    this.updateNote = JSON.parse(JSON.stringify(this.note_text));
  }

  ngAfterViewInit() {
    this.initializeEditorToolbar();
    this.setupLinkButton();
  }

  private initializeEditorToolbar(): void {
    setTimeout(() => {
      // Setup picker dropdowns
      document.querySelectorAll(".ae-picker-label").forEach((label) => {
        this.renderer.listen(label, "click", () => {
          const dropdown = label.nextElementSibling as HTMLElement;
          if (dropdown?.classList.contains("ae-picker-options")) {
            this.positionDropdown(label, dropdown);
          }
        });
      });

      // Ensure all buttons are enabled and have proper event listeners
      document.querySelectorAll(".ae-button").forEach((button) => {
        button.removeAttribute("disabled");
        this.setupButtonEvents(button);
      });
    }, 300);
  }

  private positionDropdown(label: Element, dropdown: HTMLElement): void {
    const rect = label.getBoundingClientRect();
    dropdown.style.position = "fixed";
    dropdown.style.top = `${rect.bottom + 4}px`;
    // dropdown.style.left = `${rect.left}px`;
    dropdown.style.zIndex = "9999";
    dropdown.style.width = "max-content";
    dropdown.style.minWidth = `${rect.width}px`;
    dropdown.style.background = "white";
    dropdown.style.border = "1px solid #ddd";
    dropdown.style.boxShadow = "0px 4px 8px rgba(0, 0, 0, 0.1)";
    dropdown.style.maxHeight = "350px";
    dropdown.style.overflowY = "auto";
    dropdown.style.borderRadius = "16px";
  }

  private setupButtonEvents(button: Element): void {
    this.renderer.listen(button, "mousedown", (event) => {
      event.preventDefault();
      (button as HTMLElement).click();
    });

    this.renderer.listen(button, "click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.cdr.detectChanges();
    });
  }

  private setupLinkButton(): void {
    setTimeout(() => {
      const linkBtn = document.querySelector("#link-") as HTMLButtonElement;
      if (linkBtn) {
        linkBtn.disabled = false;
        linkBtn.classList.remove("disabled");
      }
    }, 500);
  }

  onContentChange(content: string): void {
    this.note_text = content;
    this.noteChange.emit(content);
    this.noteService.setNoteIsUpdatedSubject(true);
    // this.updateNote = content;
  }

  onClickEditor(): void {
    setTimeout(() => {
      this.cdr.detectChanges();
    }, 100);
  }

  onLeave() {
    // Add cleanup or save logic here
    // this.noteChange.emit(this.updateNote);
  }
}
