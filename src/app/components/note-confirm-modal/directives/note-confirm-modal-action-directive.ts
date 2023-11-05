import { Directive, TemplateRef } from '@angular/core';

@Directive({ selector: '[confirmModalAction]' })
export class NoteConfirmModalActionDirective {
  constructor(public templateRef: TemplateRef<any>) {}
}
