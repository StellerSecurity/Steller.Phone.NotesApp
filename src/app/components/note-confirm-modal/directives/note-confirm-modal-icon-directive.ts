import { Directive, TemplateRef } from '@angular/core';

@Directive({ selector: '[confirmModalIcon]' })
export class NoteConfirmModalIconDirective {
  constructor(public templateRef: TemplateRef<any>) {}
}
