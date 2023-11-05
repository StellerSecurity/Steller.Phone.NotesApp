import { Directive, TemplateRef } from '@angular/core';

@Directive({ selector: '[confirmModalAction]' })
export class NoteConfirmModalIconDirective {
  constructor(public templateRef: TemplateRef<any>) {}
}
