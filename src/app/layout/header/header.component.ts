import { Component, OnChanges, Input, ContentChild } from '@angular/core';
import { HeaderBackBtn } from './directives/header-back-btn.directive';
import { HeaderActionbar } from './directives/header-action-bar.directive';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent implements OnChanges {
  constructor() {}

  @Input() title: string = '';
  @Input() variant?: 'primary' | 'white' = 'primary';
  @ContentChild(HeaderBackBtn) backBtn?: HeaderBackBtn;
  @ContentChild(HeaderActionbar) actionBar?: HeaderActionbar;
  public className: string = 'header-white';

  ngOnInit() {}

  ngOnChanges() {
    this.className =
      this.variant == 'white' ? 'header-white' : 'header-primary';
  }
}
