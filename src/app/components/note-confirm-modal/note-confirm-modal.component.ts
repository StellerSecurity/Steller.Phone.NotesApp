import {
  Component,
  OnInit,
  Input,
  Output,
  EventEmitter,
  ContentChild,
  ViewChild,
} from '@angular/core';
import { IonModal } from '@ionic/angular';

import { NoteConfirmModalActionDirective } from './directives/note-confirm-modal-action-directive';
import { NoteConfirmModalIconDirective } from './directives/note-confirm-modal-icon-directive';

@Component({
  selector: 'note-confirm-modal',
  templateUrl: './note-confirm-modal.component.html',
  styleUrls: ['./note-confirm-modal.component.scss'],
})
export class NoteConfirmModalComponent implements OnInit {
  constructor() {}

  @ViewChild(IonModal) modal: IonModal;

  cancel() {
    this.modal.dismiss(null, 'cancel');
  }

  onWillDismiss(event: Event) {
    // const ev = event as CustomEvent<OverlayEventDetail<string>>;
    // if (ev.detail.role === 'confirm') {
    //   this.message = `Hello, ${ev.detail.data}!`;
    // }
  }

  @ContentChild(NoteConfirmModalActionDirective)
  actionSection: NoteConfirmModalActionDirective;
  @ContentChild(NoteConfirmModalIconDirective)
  iconSection: NoteConfirmModalIconDirective;

  @Input() title: string = '';
  @Input() text: string = '';
  @Input() isOpen: boolean = false;

  ngOnInit() {}
}
