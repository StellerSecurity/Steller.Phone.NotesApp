import { Directive } from '@angular/core';
import { TemplateRef } from '@angular/core';

@Directive({ selector: '[footerBody]' })
export class BodyDirective {
  constructor(public templateRef: TemplateRef<any>) {}
}
