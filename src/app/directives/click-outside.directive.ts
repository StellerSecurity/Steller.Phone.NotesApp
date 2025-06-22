import {
  Directive,
  ElementRef,
  Output,
  EventEmitter,
  HostListener,
  NgZone
} from '@angular/core';

@Directive({
  selector: '[appClickOutside]'
})
export class ClickOutsideDirective {
  @Output() appClickOutside = new EventEmitter<void>();

  private isListening = false;

  constructor(private elementRef: ElementRef, private ngZone: NgZone) {
    // Delay the initial outside click listening to prevent immediate trigger
    setTimeout(() => this.isListening = true, 0);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    this.handleOutsideClick(event.target as HTMLElement);
  }

  @HostListener('document:touchstart', ['$event'])
  onDocumentTouch(event: TouchEvent): void {
    this.handleOutsideClick(event.target as HTMLElement);
  }

  private handleOutsideClick(target: HTMLElement) {
    this.ngZone.run(() => {
      const clickedInside = this.elementRef.nativeElement.contains(target);
      if (!clickedInside && this.isListening) {
        this.appClickOutside.emit();
      }
    });
  }
}
