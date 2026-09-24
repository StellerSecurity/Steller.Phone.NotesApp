import { fakeAsync, tick } from '@angular/core/testing';
import { ElementRef } from '@angular/core';
import { RichTextEditorComponent } from './add-note/rich-text-editor/rich-text-editor.component';
import { NoteLockedModalComponent } from './note-locked-modal/note-locked-modal.component';
import { AddNotePage } from './add-note/add-note.page';

describe('Ionic focus and editing regression', () => {
 function editor(): any {
  const host = document.createElement('div'); document.body.append(host);
  const c: any = new RichTextEditorComponent({} as any, {} as any, {} as any, {} as any, {} as any, new ElementRef(host), 'browser');
  c.quill = {getLength: () => 1, root: {focus: jasmine.createSpy('rootFocus')}, getSelection: () => ({index: 4, length: 0}), setSelection: jasmine.createSpy("selection"), formatLine: jasmine.createSpy("formatLine"), format: () => {}, focus: jasmine.createSpy('quillFocus')};
  c.headerSelectRef = {nativeElement: {value: ''}};
  return {c, host};
 }
 it('does not focus an editor after destruction', fakeAsync(() => {
  const {c, host} = editor(); c.ngOnDestroy(); c.focusEmptyEditorWithoutScrolling(); tick(500);
  expect(c.quill.root.focus).not.toHaveBeenCalled(); host.remove();
 }));
 it('refocuses after heading selection without browser scrolling', fakeAsync(() => {
  const {c, host} = editor(); c.selectOption('1'); tick(60);
  expect(c.quill.root.focus).toHaveBeenCalledWith({preventScroll: true});
  expect(c.quill.focus).not.toHaveBeenCalled();
  expect(c.quill.formatLine).toHaveBeenCalledWith(4, 0, 'header', 1, 'user');
  expect(c.quill.setSelection).toHaveBeenCalledWith(4, 0, 'silent'); c.ngOnDestroy(); host.remove();
 }));
 it('cancels pending autofocus when Ionic caches a page on navigation', fakeAsync(() => {
  const {c, host} = editor();
  c.scheduleFocusWork(() => c.focusEmptyEditorWithoutScrolling(), 300);
  c.setViewActive(false); c.setViewActive(true); tick(500);
  expect(c.quill.root.focus).not.toHaveBeenCalled(); c.ngOnDestroy(); host.remove();
 }));
 it('cancels password autofocus when the modal is dismissed quickly', fakeAsync(() => {
  const c = new NoteLockedModalComponent({dismiss: () => Promise.resolve()} as any, {tap: () => {}} as any);
  const focus = jasmine.createSpy('focus'); c.passwordInput = {value: '', setFocus: focus} as any;
  c.ngAfterViewInit(); c.dismiss(false); tick(250);
  expect(focus).not.toHaveBeenCalled();
 }));
 it('keeps spaces while typing a multi-word note title', () => {
  const c: any = Object.create(AddNotePage.prototype);
  c.notes = []; c.captureEditorScrollState = () => ({}); c.restoreEditorScrollState = () => {}; c.onSave = () => {};
  c.noteTitleChange({detail: {value: 'Shopping '}});
  expect(c.note_title).toBe('Shopping ');
 });
});
