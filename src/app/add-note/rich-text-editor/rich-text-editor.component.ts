import { Component, EventEmitter, Input, Output, Renderer2, Inject, PLATFORM_ID, OnInit, OnDestroy } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-rich-text-editor',
  templateUrl: './rich-text-editor.component.html',
  styleUrls: ['./rich-text-editor.component.scss']
})
export class RichTextEditorComponent implements OnInit, OnDestroy {

  @Input() note_text: string = '';
  @Output() noteChange = new EventEmitter<string>();

  quill: any;
  private mutationObserver: MutationObserver | null = null;
  private isIOS = false;
  private isAndroid = false;
  private isDropdownOpen = false;
  private currentScrollPosition = 0;

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

  constructor(
    private renderer: Renderer2,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    if (isPlatformBrowser(this.platformId)) {
      const userAgent = navigator.userAgent;
      this.isIOS = /iPad|iPhone|iPod/.test(userAgent);
      this.isAndroid = /Android/.test(userAgent);
    }
  }

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      // Use capture phase to ensure we get events first
      document.addEventListener('click', this.onDocumentClick.bind(this), true);
      document.addEventListener('touchstart', this.onDocumentClick.bind(this), true);

      // Handle orientation change
      window.addEventListener('orientationchange', this.onOrientationChange.bind(this));
      window.addEventListener('resize', this.onOrientationChange.bind(this));
    }
  }

  ngOnDestroy() {
    if (isPlatformBrowser(this.platformId)) {
      document.removeEventListener('click', this.onDocumentClick.bind(this), true);
      document.removeEventListener('touchstart', this.onDocumentClick.bind(this), true);
      window.removeEventListener('orientationchange', this.onOrientationChange.bind(this));
      window.removeEventListener('resize', this.onOrientationChange.bind(this));

      if (this.mutationObserver) {
        this.mutationObserver.disconnect();
      }
    }
  }

  onEditorCreated(quillInstance: any) {
    this.quill = quillInstance;

    // Wait for Quill to fully initialize
    setTimeout(() => {
      this.setupDropdownObserver();
      this.fixToolbarScrolling();
    }, 500);
  }

  onContentChange(content: string) {
    this.note_text = content;
    this.noteChange.emit(content);
  }

  private fixToolbarScrolling() {
    const toolbar = document.getElementById('custom-toolbar');
    if (toolbar) {
      // Ensure smooth scrolling on all devices
      this.renderer.setStyle(toolbar, '-webkit-overflow-scrolling', 'touch');

      if (this.isAndroid) {
        // Android specific fixes
        this.renderer.setStyle(toolbar, 'scrollbar-width', 'thin');
      }
    }
  }

  private setupDropdownObserver() {
    const headerPill = document.querySelector('#custom-toolbar .header-pill');
    if (!headerPill) return;

    // Observe class changes on the picker
    this.mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const target = mutation.target as HTMLElement;

          if (target.classList.contains('ql-expanded') && !this.isDropdownOpen) {
            this.isDropdownOpen = true;
            this.handleDropdownOpen();
          } else if (!target.classList.contains('ql-expanded') && this.isDropdownOpen) {
            this.isDropdownOpen = false;
            this.restoreToolbar();
          }
        }
      });
    });

    // Observe the picker element
    const picker = headerPill.querySelector('.ql-picker');
    if (picker) {
      this.mutationObserver.observe(picker, { attributes: true });
    }
  }

  private onOrientationChange() {
    if (this.isDropdownOpen) {
      // Reposition dropdown on orientation change
      setTimeout(() => {
        const headerPill = document.querySelector('#custom-toolbar .header-pill') as HTMLElement;
        if (headerPill) {
          this.positionDropdown(headerPill);
        }
      }, 100);
    }
  }

  private onDocumentClick(event: MouseEvent | TouchEvent) {
    const target = event.target as HTMLElement;
    const headerPill = document.querySelector('#custom-toolbar .header-pill');
    const toolbar = document.getElementById('custom-toolbar');

    if (!headerPill || !toolbar) return;

    // Store scroll position
    this.currentScrollPosition = toolbar.scrollLeft;

    // If clicking on header pill or its children
    if (headerPill.contains(target)) {
      // Allow Quill to handle the click first
      setTimeout(() => {
        const picker = headerPill.querySelector('.ql-picker');
        if (picker?.classList.contains('ql-expanded')) {
          this.handleDropdownOpen();
        }
      }, this.isIOS ? 50 : 100);
    }
    // If clicking outside and dropdown is open
    else if (this.isDropdownOpen) {
      const options = document.querySelector('.ql-picker-options');
      if (options && !options.contains(target)) {
        // Let Quill handle closing
        setTimeout(() => {
          this.restoreToolbar();
        }, 100);
      }
    }
  }

  private handleDropdownOpen() {
    const toolbar = document.getElementById('custom-toolbar');
    const headerPill = document.querySelector('#custom-toolbar .header-pill') as HTMLElement;

    if (toolbar && headerPill) {
      // Store current scroll position
      this.currentScrollPosition = toolbar.scrollLeft;

      // Disable scrolling with platform-specific handling
      this.renderer.setStyle(toolbar, 'overflow-x', 'hidden');

      // Add platform-specific classes
      if (this.isIOS) {
        this.renderer.addClass(document.body, 'ios-dropdown-open');
      } else if (this.isAndroid) {
        this.renderer.addClass(document.body, 'android-dropdown-open');
      }

      // Position dropdown with slight delay for DOM update
      setTimeout(() => {
        this.positionDropdown(headerPill);
      }, this.isIOS ? 10 : 50);
    }
  }

  private positionDropdown(headerPill: HTMLElement) {
    const options = document.querySelector('.ql-picker-options') as HTMLElement;
    if (!options) return;

    // Get positions
    const headerRect = headerPill.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate dropdown dimensions
    const dropdownWidth = Math.max(160, options.offsetWidth);
    const dropdownHeight = Math.min(200, options.scrollHeight);

    // Calculate left position
    let leftPosition = headerRect.left;
    if (leftPosition + dropdownWidth > viewportWidth - 16) {
      leftPosition = viewportWidth - dropdownWidth - 16;
    }
    leftPosition = Math.max(16, leftPosition);

    // Calculate if should show above or below
    const spaceBelow = viewportHeight - headerRect.bottom;
    let topPosition = headerRect.bottom;
    let marginTop = 4;
    let marginBottom = 0;

    if (spaceBelow < dropdownHeight && headerRect.top > dropdownHeight) {
      topPosition = headerRect.top - dropdownHeight;
      marginTop = 0;
      marginBottom = 4;
    }

    // Apply platform-specific styles
    this.renderer.setStyle(options, 'position', 'fixed');
    this.renderer.setStyle(options, 'top', `${topPosition}px`);
    this.renderer.setStyle(options, 'left', `${leftPosition}px`);
    this.renderer.setStyle(options, 'min-width', `${dropdownWidth}px`);
    this.renderer.setStyle(options, 'z-index', '10000');
    this.renderer.setStyle(options, 'margin-top', marginTop ? '4px' : '0');
    this.renderer.setStyle(options, 'margin-bottom', marginBottom ? '4px' : '0');
    this.renderer.setStyle(options, 'max-height', '200px');
    this.renderer.setStyle(options, 'overflow-y', 'auto');

    // Platform-specific optimizations
    if (this.isIOS) {
      this.renderer.setStyle(options, '-webkit-overflow-scrolling', 'touch');
      this.renderer.setStyle(options, 'transform', 'translateZ(0)'); // Force GPU acceleration
    } else if (this.isAndroid) {
      this.renderer.setStyle(options, 'webkit-overflow-scrolling', 'auto'); // Better for Android
    }
  }

  private restoreToolbar() {
    const toolbar = document.getElementById('custom-toolbar');
    if (toolbar) {
      // Restore scrolling
      this.renderer.removeStyle(toolbar, 'overflow-x');

      // Restore scroll position
      setTimeout(() => {
        toolbar.scrollLeft = this.currentScrollPosition;
      }, 10);

      // Remove platform-specific classes
      this.renderer.removeClass(document.body, 'ios-dropdown-open');
      this.renderer.removeClass(document.body, 'android-dropdown-open');
    }
  }
}
