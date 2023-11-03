import { Directive, TemplateRef } from '@angular/core';

@Directive({
  selector: '[headerBackBtn]',
})
export class HeaderBackBtn {
  constructor(public templateRef: TemplateRef<any>) {}
}
