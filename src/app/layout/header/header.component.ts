import {
  Component,
  OnChanges,
  Input,
  Output,
  ContentChild,
  EventEmitter,
} from '@angular/core';
import { HeaderBackBtn } from './directives/header-back-btn.directive';
import { HeaderActionbar } from './directives/header-action-bar.directive';
import { NavController } from '@ionic/angular';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent implements OnChanges {
  constructor(private navController: NavController) {}

  @Input() title: string = '';
  @Input() variant?: 'primary' | 'white' = 'primary';
  @Input() backButton: boolean = false;

  @Output() backClickEvent: EventEmitter<null> = new EventEmitter<null>();

  @ContentChild(HeaderBackBtn) backBtn?: HeaderBackBtn;
  @ContentChild(HeaderActionbar) actionBar?: HeaderActionbar;
  public className: string = 'header-white';

  ngOnInit() {}

  ngOnChanges() {
    this.className =
      this.variant == 'white' ? 'header-white' : 'header-primary';
  }

  handleBackButtonClick() {
    this.backClickEvent.emit();
  }
}
