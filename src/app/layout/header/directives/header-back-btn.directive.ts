import { Directive, TemplateRef } from '@angular/core';

@Directive({
  selector: '[headerBackButton]',
})
export class HeaderBackBtn {
  constructor(public templateRef: TemplateRef<any>) {}
}
