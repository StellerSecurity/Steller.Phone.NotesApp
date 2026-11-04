import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';

@Component({
  selector: 'app-account-dialog', standalone: true, imports: [CommonModule, IonicModule],
  template: `<ion-modal [isOpen]="isOpen" [backdropDismiss]="true" [animated]="animated" (didDismiss)="dismiss.emit()" class="account-dialog">
    <ng-template><section role="dialog" aria-modal="true" [attr.aria-label]="title">
      <header><h2>{{title}}</h2><button type="button" class="close" (click)="dismiss.emit()" [attr.aria-label]="closeLabel"><ion-icon name="close-outline"></ion-icon></button></header>
      <p>{{message}}</p><footer><ion-button fill="clear" (click)="dismiss.emit()">{{cancelLabel}}</ion-button>
      <ion-button [color]="destructive ? 'danger' : 'primary'" (click)="confirm.emit()" [disabled]="busy"><ion-spinner *ngIf="busy" name="crescent"></ion-spinner><span *ngIf="!busy">{{confirmLabel}}</span></ion-button></footer>
    </section></ng-template></ion-modal>`,
  styles: [`ion-modal.account-dialog{--width:calc(100% - 32px);--max-width:420px;--height:auto;--border-radius:24px;--backdrop-opacity:.35;--box-shadow:0 20px 60px #0b0c1926}
    section{padding:24px;background:var(--stellar-surface,#fff);color:var(--stellar-text,#0B0C19)}header{display:flex;align-items:flex-start;gap:16px;justify-content:space-between}
    h2{font-size:20px;font-weight:700;line-height:1.5;margin:2px 0 16px;overflow-wrap:anywhere}.close{flex:0 0 44px;width:44px;height:44px;border:0;border-radius:12px;background:transparent;color:var(--stellar-muted,#62626A);display:grid;place-items:center}.close ion-icon{font-size:24px}
    .close:focus-visible{outline:2px solid #2761FC;outline-offset:2px}p{font-size:14px;line-height:1.6;color:var(--stellar-muted,#62626A);margin:0 0 24px}footer{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}ion-button{min-height:44px;--border-radius:12px;--box-shadow:none;text-transform:none;font-weight:700}
    @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`],
})
export class AccountDialogComponent {
  @Input() isOpen = false;
  @Input() title = '';
  @Input() message = '';
  @Input() cancelLabel = 'Cancel';
  @Input() confirmLabel = 'Confirm';
  @Input() closeLabel = 'Close';
  @Input() destructive = false;
  @Input() busy = false;
  @Output() dismiss = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();
  readonly animated = typeof matchMedia !== 'function' || !matchMedia('(prefers-reduced-motion: reduce)').matches;
}
