import {
  Component, EventEmitter, Input, Output, Renderer2,
  Inject, PLATFORM_ID, OnInit, OnDestroy, ViewChild, ElementRef
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

interface HeaderOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-rich-text-editor',
  templateUrl: './rich-text-editor.component.html',
  styleUrls: ['./rich-text-editor.component.scss']
})
export class RichTextEditorComponent implements OnInit, OnDestroy {
  @ViewChild('headerSelect') headerSelectRef!: ElementRef<HTMLSelectElement>;
  @ViewChild('headerPill') headerPillRef!: ElementRef;
  @ViewChild('toolbar') toolbarRef!: ElementRef;

  @Input() note_text: string = '';
  @Output() noteChange = new EventEmitter<string>();

  quill: any;
  private isDropdownOpen = false;
  private dropdownElement: HTMLElement | null = null;
  private resizeListener: (() => void) | null = null;
  private clickOutsideListener: (() => void) | null = null;

  readonly headerOptions: HeaderOption[] = [
    { value: 'false', label: 'standard' },
    { value: '1', label: 'heading1' },
    { value: '2', label: 'heading2' },
    { value: '3', label: 'heading3' },
    { value: '4', label: 'heading4' },
    { value: '5', label: 'heading5' },
    { value: '6', label: 'heading6' }
  ];

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

  constructor(
    private renderer: Renderer2,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.resizeListener = this.renderer.listen('window', 'resize', () => {
        if (this.isDropdownOpen) {
          this.positionDropdown();
        }
      });
    }
  }

  ngOnDestroy() {
    this.closeDropdown();
    if (this.resizeListener) {
      this.resizeListener();
    }
  }

  onEditorCreated(quillInstance: any) {
    this.quill = quillInstance;

      // Wait for DOM + Ionic rendering
      requestAnimationFrame(() => {
        setTimeout(() => {
          const length = this.quill.getLength();
          // this.quill.setSelection(length, 0);
          if(length == 1) {
            this.quill.focus();
          }
        }, 300);
      });
  }

  onContentChange(content: string) {
    this.note_text = content;
    this.noteChange.emit(content);
  }

  onHeaderChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const value = select.value;

    if (this.quill) {
      const headerValue = value === 'false' ? false : parseInt(value);
      this.quill.format('header', headerValue);
    }
  }

  getSelectedHeaderText(): string {
    if (!this.headerSelectRef?.nativeElement) return 'standard';
    const selectedValue = this.headerSelectRef.nativeElement.value;
    const selectedOption = this.headerOptions.find(opt => opt.value === selectedValue);
    return selectedOption ? selectedOption.label : 'standard';
  }

  toggleDropdown(event: Event) {
    event.preventDefault();
    event.stopPropagation();

    if (this.isDropdownOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  private openDropdown() {
    if (!this.headerPillRef?.nativeElement) return;

    // Close any existing dropdown first
    if (this.isDropdownOpen) {
      this.closeDropdown();
    }

    this.isDropdownOpen = true;

    // Create dropdown
    this.dropdownElement = this.renderer.createElement('div');
    this.renderer.addClass(this.dropdownElement, 'custom-header-dropdown');

    // Add options
    this.headerOptions.forEach(option => {
      const optionElement = this.renderer.createElement('div');
      this.renderer.addClass(optionElement, 'dropdown-item');
      this.renderer.setProperty(optionElement, 'textContent', option.label);
      this.renderer.setAttribute(optionElement, 'data-value', option.value);

      // Highlight selected option
      if (this.headerSelectRef?.nativeElement?.value === option.value) {
        this.renderer.addClass(optionElement, 'selected');
      }

      // Add click handler with immediate stopPropagation
      this.renderer.listen(optionElement, 'click', (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        this.selectOption(option.value);
      });

      // Add hover effect for desktop
      this.renderer.listen(optionElement, 'mouseenter', () => {
        this.renderer.addClass(optionElement, 'hover');
      });

      this.renderer.listen(optionElement, 'mouseleave', () => {
        this.renderer.removeClass(optionElement, 'hover');
      });

      this.renderer.appendChild(this.dropdownElement, optionElement);
    });

    // Position the dropdown
    this.positionDropdown();

    // Add to body
    this.renderer.appendChild(document.body, this.dropdownElement);

    // Add class to body
    this.renderer.addClass(document.body, 'dropdown-open');

    // Setup click outside listener
    setTimeout(() => {
      // Remove any existing listener first
      if (this.clickOutsideListener) {
        this.clickOutsideListener();
        this.clickOutsideListener = null;
      }

      const unlisten = this.renderer.listen('document', 'click', (event: MouseEvent) => {
        // Don't close if dropdown is not open
        if (!this.isDropdownOpen) return;

        const target = event.target as HTMLElement;
        const trigger = this.headerPillRef?.nativeElement?.querySelector('.header-trigger');
        const dropdown = this.dropdownElement;

        // Check if click is outside both trigger and dropdown
        if (dropdown &&
            !dropdown.contains(target) &&
            trigger &&
            !trigger.contains(target)) {
          this.closeDropdown();
        }
      });

      this.clickOutsideListener = unlisten;
    }, 100);
  }

  private positionDropdown() {
    if (!this.dropdownElement || !this.headerPillRef?.nativeElement) return;

    const trigger = this.headerPillRef.nativeElement.querySelector('.header-trigger');
    if (!trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const dropdownHeight = 250;
    const dropdownWidth = 140;

    // Calculate position
    let topPosition = triggerRect.bottom + 4;
    let leftPosition = triggerRect.left;

    // Check if dropdown would go off screen horizontally
    if (leftPosition + dropdownWidth > viewportWidth - 16) {
      leftPosition = viewportWidth - dropdownWidth - 16;
    }
    leftPosition = Math.max(16, leftPosition);

    // Check if dropdown would go off screen vertically
    let bottomPosition = 'auto';
    if (topPosition + dropdownHeight > viewportHeight) {
      topPosition = 'auto';
      bottomPosition = viewportHeight - triggerRect.top + 4 + 'px';
    }

    // Apply styles
    this.renderer.setStyle(this.dropdownElement, 'position', 'fixed');
    this.renderer.setStyle(this.dropdownElement, 'top', topPosition !== 'auto' ? topPosition + 'px' : 'auto');
    this.renderer.setStyle(this.dropdownElement, 'bottom', bottomPosition !== 'auto' ? bottomPosition : 'auto');
    this.renderer.setStyle(this.dropdownElement, 'left', leftPosition + 'px');
    this.renderer.setStyle(this.dropdownElement, 'min-width', dropdownWidth + 'px');
  }

  private selectOption(value: string) {
    // Immediately close dropdown first (before any other operations)
    this.closeDropdown();

    // Then update select element
    if (this.headerSelectRef?.nativeElement) {
      this.headerSelectRef.nativeElement.value = value;

      // Trigger Quill format
      if (this.quill) {
        const headerValue = value === 'false' ? false : parseInt(value);
        this.quill.format('header', headerValue);

        // Keep focus on editor
        setTimeout(() => {
          this.quill.focus();
        }, 50);
      }

      // Trigger change event
      this.onHeaderChange(new Event('change'));
    }
  }

  private closeDropdown() {
    if (!this.isDropdownOpen) return;

    this.isDropdownOpen = false;

    // Remove dropdown element immediately
    if (this.dropdownElement) {
      // Remove all children first to prevent memory leaks
      while (this.dropdownElement.firstChild) {
        this.dropdownElement.removeChild(this.dropdownElement.firstChild);
      }

      // Remove from DOM
      if (this.dropdownElement.parentNode) {
        this.dropdownElement.parentNode.removeChild(this.dropdownElement);
      }
      this.dropdownElement = null;
    }

    // Remove body class
    this.renderer.removeClass(document.body, 'dropdown-open');

    // Remove click outside listener
    if (this.clickOutsideListener) {
      this.clickOutsideListener();
      this.clickOutsideListener = null;
    }
  }
}
