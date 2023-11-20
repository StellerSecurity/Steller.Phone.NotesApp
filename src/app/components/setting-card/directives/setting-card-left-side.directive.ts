import { Directive, TemplateRef } from '@angular/core';

@Directive({ selector: '[settingCardLeftSide]' })
export class LeftSideDirective {
  constructor(public templateRef: TemplateRef<any>) {}
}
