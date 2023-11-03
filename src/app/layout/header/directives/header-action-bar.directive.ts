import { Directive, TemplateRef } from '@angular/core';

@Directive({
  selector: '[headerActionbar]',
})
export class HeaderActionbar {
  constructor(public templateRef: TemplateRef<any>) {}
}
