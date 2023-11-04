import { Directive, TemplateRef } from '@angular/core';

@Directive({ selector: '[footerBefore]' })
export class BeforeDirective {
  constructor(public templateRef: TemplateRef<any>) {}
}
