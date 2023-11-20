import { Component, OnInit, ContentChild, Input } from '@angular/core';
import { BeforeDirective } from './directives/footer-before.directive';
import { BodyDirective } from './directives/footer-body.directive';
@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss'],
})
export class FooterComponent implements OnInit {
  constructor() {}
  @ContentChild(BeforeDirective) before?: BeforeDirective;
  @ContentChild(BodyDirective) body?: BodyDirective;
  @Input() variant: 'white' | 'light' = 'white';

  public bgClass = 'bg-color-white';

  ngOnInit() {
    this.bgClass =
      this.variant == 'white' ? 'bg-color-white' : 'bg-color-light';
  }
}
