import {
  Component, EventEmitter, Input, Output, Renderer2,
  Inject, PLATFORM_ID, OnInit, OnDestroy, ViewChild, ElementRef
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ToastController } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { TranslatorService } from '../../services/translator.service';
import { AppHapticsService } from '../../services/app-haptics.service';

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
  @ViewChild('viewerViewport') viewerViewportRef?: ElementRef<HTMLDivElement>;
  @ViewChild('viewerImage') viewerImageRef?: ElementRef<HTMLImageElement>;

  @Input() note_text: string = '';
  @Output() noteChange = new EventEmitter<string>();

  quill: any;
  allTranslations: any;
  imageViewerOpen = false;
  viewerImageSrc = '';
  private isDropdownOpen = false;
  private dropdownElement: HTMLElement | null = null;
  private resizeListener: (() => void) | null = null;
  private clickOutsideListener: (() => void) | null = null;
  private editorImageClickUnlisten: (() => void) | null = null;
  private editorCopyUnlisten: (() => void) | null = null;
  private viewerPointers = new Map<number, { x: number; y: number }>();
  private lastTapAt = 0;
  private pinchStartDistance: number | null = null;
  private pinchStartScale = 1;
  private panStartPointer: { x: number; y: number } | null = null;
  private panStartTranslate = { x: 0, y: 0 };

  viewerScale = 1;
  viewerTranslateX = 0;
  viewerTranslateY = 0;

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
    private toastController: ToastController,
    private translatorService: TranslatorService,
    private appHaptics: AppHapticsService,
    private hostRef: ElementRef<HTMLElement>,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    this.allTranslations = this.translatorService.allTranslations;
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
    if (this.editorImageClickUnlisten) {
      this.editorImageClickUnlisten();
      this.editorImageClickUnlisten = null;
    }
    if (this.editorCopyUnlisten) {
      this.editorCopyUnlisten();
      this.editorCopyUnlisten = null;
    }
  }

  onEditorCreated(quillInstance: any) {
    this.quill = quillInstance;
    this.bindImageClickHandler();
    this.bindCopyHandler();

    requestAnimationFrame(() => {
      setTimeout(() => this.focusEmptyEditorWithoutScrolling(), 300);
    });
  }

  private focusEmptyEditorWithoutScrolling(): void {
    if (!isPlatformBrowser(this.platformId) || !this.quill) {
      return;
    }

    const length = this.quill.getLength?.() ?? 0;

    if (length !== 1) {
      return;
    }

    const editorRoot = this.quill.root as HTMLElement | undefined;
    const ionContent = this.hostRef.nativeElement.closest('ion-content') as any;
    const documentScrollElement = document.scrollingElement as HTMLElement | null;
    const savedDocumentScrollTop = documentScrollElement?.scrollTop ?? 0;

    const restoreTop = () => {
      if (documentScrollElement) {
        documentScrollElement.scrollTop = savedDocumentScrollTop;
      }

      if (ionContent?.scrollToTop) {
        void ionContent.scrollToTop(0);
      }

      if (ionContent?.getScrollElement) {
        void ionContent.getScrollElement().then((scrollElement: HTMLElement) => {
          scrollElement.scrollTop = 0;
        });
      }
    };

    restoreTop();

    try {
      editorRoot?.focus({ preventScroll: true });
    } catch {
      editorRoot?.focus();
    }

    try {
      this.quill.setSelection?.(0, 0, 'silent');
    } catch {
      // Keep native focus even if Quill selection is not ready yet.
    }

    restoreTop();

    requestAnimationFrame(() => {
      restoreTop();
      setTimeout(restoreTop, 50);
      setTimeout(restoreTop, 150);
    });
  }

  onContentChange(content: string) {
    this.note_text = content;
    this.noteChange.emit(content);
  }

  private bindCopyHandler(): void {
    if (!isPlatformBrowser(this.platformId) || !this.quill?.root) {
      return;
    }

    if (this.editorCopyUnlisten) {
      this.editorCopyUnlisten();
    }

    this.editorCopyUnlisten = this.renderer.listen(
      this.quill.root,
      'copy',
      (event: ClipboardEvent) => {
        const clipboard = event.clipboardData;
        const selection = this.quill?.getSelection?.();

        if (!clipboard || !selection || selection.length <= 0) {
          return;
        }

        try {
          const selectedContents = this.quill.getContents(
            selection.index,
            selection.length
          );
          const containsEmbed = selectedContents?.ops?.some(
            (operation: any) => typeof operation?.insert !== 'string'
          );

          // Preserve the browser's native copy behavior for images and other
          // embeds. For text-only selections, omit Quill's paragraph HTML:
          // apps such as WhatsApp otherwise render every line as two lines.
          if (containsEmbed) {
            return;
          }

          const plainText = String(
            this.quill.getText(selection.index, selection.length) ?? ''
          )
            .replace(/\r\n?/g, '\n')
            .replace(/\u00A0/g, ' ');

          clipboard.setData('text/plain', plainText);
          event.preventDefault();
        } catch {
          // Fall back to the native clipboard if Quill cannot resolve the
          // current selection.
        }
      }
    );
  }

  onHeaderChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const value = select.value;

    if (this.quill) {
      const headerValue = value === 'false' ? false : parseInt(value, 10);
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

  openImageViewer(src: string) {
    if (!src) {
      return;
    }
    this.resetViewerTransform();
    this.viewerImageSrc = src;
    this.imageViewerOpen = true;
  }

  closeImageViewer() {
    this.imageViewerOpen = false;
    this.viewerImageSrc = '';
    this.resetViewerTransform();
  }

  onViewerPointerDown(event: PointerEvent) {
    if (!this.imageViewerOpen) {
      return;
    }

    const now = Date.now();
    if (now - this.lastTapAt < 260) {
      this.toggleViewerZoom(event.clientX, event.clientY);
      this.lastTapAt = 0;
    } else {
      this.lastTapAt = now;
    }

    this.viewerPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.viewerPointers.size === 1 && this.viewerScale > 1) {
      this.panStartPointer = { x: event.clientX, y: event.clientY };
      this.panStartTranslate = { x: this.viewerTranslateX, y: this.viewerTranslateY };
    }

    if (this.viewerPointers.size === 2) {
      const [first, second] = Array.from(this.viewerPointers.values());
      this.pinchStartDistance = this.getDistance(first, second);
      this.pinchStartScale = this.viewerScale;
      this.panStartPointer = null;
    }
  }

  onViewerPointerMove(event: PointerEvent) {
    if (!this.viewerPointers.has(event.pointerId)) {
      return;
    }

    this.viewerPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.viewerPointers.size === 2 && this.pinchStartDistance) {
      const [first, second] = Array.from(this.viewerPointers.values());
      const nextDistance = this.getDistance(first, second);
      if (nextDistance > 0) {
        this.viewerScale = this.clampScale(this.pinchStartScale * (nextDistance / this.pinchStartDistance));
        this.constrainViewerTranslation();
      }
      return;
    }

    if (this.viewerPointers.size === 1 && this.panStartPointer && this.viewerScale > 1) {
      const deltaX = event.clientX - this.panStartPointer.x;
      const deltaY = event.clientY - this.panStartPointer.y;
      this.viewerTranslateX = this.panStartTranslate.x + deltaX;
      this.viewerTranslateY = this.panStartTranslate.y + deltaY;
      this.constrainViewerTranslation();
    }
  }

  onViewerPointerUp(event: PointerEvent) {
    this.viewerPointers.delete(event.pointerId);

    if (this.viewerPointers.size < 2) {
      this.pinchStartDistance = null;
    }

    if (this.viewerPointers.size === 1) {
      const [remaining] = Array.from(this.viewerPointers.values());
      this.panStartPointer = { x: remaining.x, y: remaining.y };
      this.panStartTranslate = { x: this.viewerTranslateX, y: this.viewerTranslateY };
    } else {
      this.panStartPointer = null;
    }

    if (this.viewerScale <= 1) {
      this.resetViewerTransform();
    }
  }

  onViewerWheel(event: WheelEvent) {
    event.preventDefault();

    const delta = event.deltaY < 0 ? 0.16 : -0.16;
    const nextScale = this.clampScale(this.viewerScale + delta);

    if (nextScale === 1) {
      this.resetViewerTransform();
      return;
    }

    this.viewerScale = nextScale;
    this.constrainViewerTranslation();
  }

  getViewerTransform(): string {
    return `translate3d(${this.viewerTranslateX}px, ${this.viewerTranslateY}px, 0) scale(${this.viewerScale})`;
  }

  private toggleViewerZoom(originX?: number, originY?: number) {
    if (this.viewerScale > 1) {
      this.resetViewerTransform();
      return;
    }

    this.viewerScale = 2;
    this.centerZoomAroundPoint(originX, originY);
    this.constrainViewerTranslation();
  }

  private resetViewerTransform() {
    this.viewerPointers.clear();
    this.viewerScale = 1;
    this.viewerTranslateX = 0;
    this.viewerTranslateY = 0;
    this.pinchStartDistance = null;
    this.panStartPointer = null;
    this.panStartTranslate = { x: 0, y: 0 };
  }

  private centerZoomAroundPoint(originX?: number, originY?: number) {
    const viewport = this.viewerViewportRef?.nativeElement;
    if (!viewport || originX == null || originY == null) {
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const offsetX = originX - (rect.left + rect.width / 2);
    const offsetY = originY - (rect.top + rect.height / 2);
    this.viewerTranslateX = -offsetX * 0.6;
    this.viewerTranslateY = -offsetY * 0.6;
  }

  private constrainViewerTranslation() {
    if (this.viewerScale <= 1) {
      this.viewerTranslateX = 0;
      this.viewerTranslateY = 0;
      return;
    }

    const viewport = this.viewerViewportRef?.nativeElement;
    const image = this.viewerImageRef?.nativeElement;

    if (!viewport || !image) {
      return;
    }

    const maxOffsetX = Math.max(0, ((image.clientWidth * this.viewerScale) - viewport.clientWidth) / 2);
    const maxOffsetY = Math.max(0, ((image.clientHeight * this.viewerScale) - viewport.clientHeight) / 2);

    this.viewerTranslateX = Math.min(maxOffsetX, Math.max(-maxOffsetX, this.viewerTranslateX));
    this.viewerTranslateY = Math.min(maxOffsetY, Math.max(-maxOffsetY, this.viewerTranslateY));
  }

  private clampScale(scale: number): number {
    return Math.min(4, Math.max(1, Number(scale.toFixed(3))));
  }

  private getDistance(first: { x: number; y: number }, second: { x: number; y: number }): number {
    const deltaX = second.x - first.x;
    const deltaY = second.y - first.y;
    return Math.hypot(deltaX, deltaY);
  }

  async saveViewerImage() {
    if (!this.viewerImageSrc) {
      return;
    }

    await this.appHaptics.tap();

    const extension = this.getImageExtension(this.viewerImageSrc);
    const fileName = `stellar-note-image-${Date.now()}.${extension}`;

    try {
      const platform = Capacitor.getPlatform();

      if (platform === 'android' || platform === 'ios') {
        await this.requestFilesystemPermissions();

        const base64Data = await this.toBase64Payload(this.viewerImageSrc);
        const galleryDirectory = this.getGalleryDirectory(platform);
        const relativePath = this.getGalleryRelativePath(platform, fileName);

        await Filesystem.writeFile({
          path: relativePath,
          data: base64Data,
          directory: galleryDirectory,
          recursive: true,
        });
      } else {
        const anchor = document.createElement('a');
        anchor.href = this.viewerImageSrc;
        anchor.download = fileName;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      }

      await this.appHaptics.success();
      await this.presentToast(this.getSavedToastMessage(platform));
    } catch (error) {
      console.error('Failed to save note image', error);
      await this.appHaptics.error();
      await this.presentToast(
        this.translatorService.allTranslations?.operationFailed ?? 'Operation failed.'
      );
    }
  }

  private async requestFilesystemPermissions(): Promise<void> {
    const requestPermissions = (Filesystem as any)?.requestPermissions;
    if (typeof requestPermissions !== 'function') {
      return;
    }

    try {
      await requestPermissions.call(Filesystem);
    } catch (error) {
      console.warn('Filesystem permission request failed', error);
    }
  }

  private getGalleryDirectory(platform: string): Directory {
    if (platform === 'android') {
      return ((Directory as any).ExternalStorage ?? (Directory as any).External ?? Directory.Documents) as Directory;
    }

    return (((Directory as any).External ?? Directory.Documents) as Directory);
  }

  private getGalleryRelativePath(platform: string, fileName: string): string {
    if (platform === 'android') {
      return `Pictures/Stellar Notes/${fileName}`;
    }

    return `Stellar Notes/${fileName}`;
  }

  private getSavedToastMessage(platform: string): string {
    if (platform === 'android') {
      return 'Saved to your gallery.';
    }

    if (platform === 'ios') {
      return 'Saved on your device.';
    }

    return 'Downloaded image.';
  }

  private getImageExtension(src: string): string {
    const normalizedSrc = src.toLowerCase();

    if (normalizedSrc.startsWith('data:image/jpeg') || normalizedSrc.startsWith('data:image/jpg') || normalizedSrc.includes('.jpg') || normalizedSrc.includes('.jpeg')) {
      return 'jpg';
    }

    if (normalizedSrc.startsWith('data:image/webp') || normalizedSrc.includes('.webp')) {
      return 'webp';
    }

    if (normalizedSrc.startsWith('data:image/gif') || normalizedSrc.includes('.gif')) {
      return 'gif';
    }

    return 'png';
  }

  private bindImageClickHandler() {
    if (!this.quill?.root) {
      return;
    }

    if (this.editorImageClickUnlisten) {
      this.editorImageClickUnlisten();
      this.editorImageClickUnlisten = null;
    }

    this.editorImageClickUnlisten = this.renderer.listen(this.quill.root, 'click', (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target || target.tagName !== 'IMG') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const src = (target as HTMLImageElement).currentSrc || (target as HTMLImageElement).src;
      if (!src) {
        return;
      }

      this.openImageViewer(src);
    });
  }

  private async toBase64Payload(src: string): Promise<string> {
    if (src.startsWith('data:')) {
      return src.split(',')[1] ?? '';
    }

    const response = await fetch(src);
    const blob = await response.blob();

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const base64 = result.split(',')[1] ?? '';
        resolve(base64);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  private async presentToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2200,
      position: 'bottom',
    });
    await toast.present();
  }

  private openDropdown() {
    if (!this.headerPillRef?.nativeElement) return;

    if (this.isDropdownOpen) {
      this.closeDropdown();
    }

    this.isDropdownOpen = true;

    this.dropdownElement = this.renderer.createElement('div');
    this.renderer.addClass(this.dropdownElement, 'custom-header-dropdown');

    this.headerOptions.forEach(option => {
      const optionElement = this.renderer.createElement('div');
      this.renderer.addClass(optionElement, 'dropdown-item');
      this.renderer.setProperty(optionElement, 'textContent', option.label);
      this.renderer.setAttribute(optionElement, 'data-value', option.value);

      if (this.headerSelectRef?.nativeElement?.value === option.value) {
        this.renderer.addClass(optionElement, 'selected');
      }

      this.renderer.listen(optionElement, 'click', (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        this.selectOption(option.value);
      });

      this.renderer.listen(optionElement, 'mouseenter', () => {
        this.renderer.addClass(optionElement, 'hover');
      });

      this.renderer.listen(optionElement, 'mouseleave', () => {
        this.renderer.removeClass(optionElement, 'hover');
      });

      this.renderer.appendChild(this.dropdownElement, optionElement);
    });

    this.positionDropdown();
    this.renderer.appendChild(document.body, this.dropdownElement);
    this.renderer.addClass(document.body, 'dropdown-open');

    setTimeout(() => {
      if (this.clickOutsideListener) {
        this.clickOutsideListener();
        this.clickOutsideListener = null;
      }

      const unlisten = this.renderer.listen('document', 'click', (event: MouseEvent) => {
        if (!this.isDropdownOpen) return;

        const target = event.target as HTMLElement;
        const trigger = this.headerPillRef?.nativeElement?.querySelector('.header-trigger');
        const dropdown = this.dropdownElement;

        if (dropdown && !dropdown.contains(target) && trigger && !trigger.contains(target)) {
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

    let topPosition: number | 'auto' = triggerRect.bottom + 4;
    let leftPosition = triggerRect.left;

    if (leftPosition + dropdownWidth > viewportWidth - 16) {
      leftPosition = viewportWidth - dropdownWidth - 16;
    }
    leftPosition = Math.max(16, leftPosition);

    let bottomPosition: string | 'auto' = 'auto';
    if (typeof topPosition === 'number' && topPosition + dropdownHeight > viewportHeight) {
      topPosition = 'auto';
      bottomPosition = `${viewportHeight - triggerRect.top + 4}px`;
    }

    this.renderer.setStyle(this.dropdownElement, 'position', 'fixed');
    this.renderer.setStyle(this.dropdownElement, 'top', topPosition !== 'auto' ? `${topPosition}px` : 'auto');
    this.renderer.setStyle(this.dropdownElement, 'bottom', bottomPosition !== 'auto' ? bottomPosition : 'auto');
    this.renderer.setStyle(this.dropdownElement, 'left', `${leftPosition}px`);
    this.renderer.setStyle(this.dropdownElement, 'min-width', `${dropdownWidth}px`);
  }

  private selectOption(value: string) {
    this.closeDropdown();

    if (this.headerSelectRef?.nativeElement) {
      this.headerSelectRef.nativeElement.value = value;

      if (this.quill) {
        const headerValue = value === 'false' ? false : parseInt(value, 10);
        this.quill.format('header', headerValue);

        setTimeout(() => {
          this.quill.focus();
        }, 50);
      }

      this.onHeaderChange(new Event('change'));
    }
  }

  private closeDropdown() {
    if (!this.isDropdownOpen) return;

    this.isDropdownOpen = false;

    if (this.dropdownElement) {
      while (this.dropdownElement.firstChild) {
        this.renderer.removeChild(this.dropdownElement, this.dropdownElement.firstChild);
      }

      if (this.dropdownElement.parentNode) {
        this.renderer.removeChild(document.body, this.dropdownElement);
      }

      this.dropdownElement = null;
    }

    this.renderer.removeClass(document.body, 'dropdown-open');

    if (this.clickOutsideListener) {
      this.clickOutsideListener();
      this.clickOutsideListener = null;
    }
  }
}
