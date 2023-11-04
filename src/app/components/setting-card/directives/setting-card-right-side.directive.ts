import { Directive } from '@angular/core';
import { TemplateRef } from '@angular/core';

@Directive({ selector: '[settingCardRightSide]' })
export class RightSideDirective {
  constructor(public templateRef: TemplateRef<any>) {}
}
