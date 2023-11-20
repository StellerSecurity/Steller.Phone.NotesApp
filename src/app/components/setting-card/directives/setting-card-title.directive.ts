import { Directive } from '@angular/core';
import { TemplateRef } from '@angular/core';

@Directive({ selector: '[settingCardTitle]' })
export class TitleDirective {
  constructor(public templateRef: TemplateRef<any>) {}
}
