import {
  Component,
  ContentChild,
  Input,
  Output,
  EventEmitter,
} from '@angular/core';
import { LeftSideDirective } from './directives/setting-card-left-side.directive';
import { RightSideDirective } from './directives/setting-card-right-side.directive';
import { TitleDirective } from './directives/setting-card-title.directive';

@Component({
  selector: 'note-setting-card',
  templateUrl: './setting-card.component.html',
  styleUrls: ['./setting-card.component.scss'],
})
export class SettingCardComponent {
  constructor() {}

  public buttonFill: 'outline' | 'solid' = 'solid';
  @Input() title: string = '';
  @Input() content: string = '';
  @Input() status?: boolean = false;
  @Input() category?: string = '';

  @ContentChild(LeftSideDirective) leftSide?: LeftSideDirective;
  @ContentChild(RightSideDirective) rightSide?: RightSideDirective;
  @ContentChild(TitleDirective) customTitle?: TitleDirective;

  @Output() statusChangeEvent: EventEmitter<any> = new EventEmitter<any>();

  ngOnChanges() {
    this.buttonFill = this.status ? 'solid' : 'outline';
  }

  onStatusChange(status: boolean) {
    this.statusChangeEvent?.emit(status);
  }
}
