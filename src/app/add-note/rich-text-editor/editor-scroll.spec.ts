import { bindEditorScroll } from './editor-scroll';
describe('editor caret scrolling', () => {
 it('uses Ionic scroll and restores a first-line caret hidden by keyboard scrolling', (done) => {
  const scroll = document.createElement('div');
  scroll.style.cssText = 'height:100px;overflow:auto';
  const root = document.createElement('div'); root.contentEditable = 'true'; root.style.height = '2000px'; root.textContent = 'first line';
  const toolbar = document.createElement('div'); scroll.append(root); document.body.append(scroll, toolbar);
  const quill = { root, scrollingContainer: root };
  const cleanup = bindEditorScroll(quill, scroll, toolbar);
  expect(quill.scrollingContainer).toBe(scroll);
  root.focus(); const range = document.createRange(); range.setStart(root.firstChild!, 0); range.collapse(true);
  const selection = document.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  // A real caret moves with its scroll container, including repeated selection events.
  spyOn(range, 'getBoundingClientRect').and.callFake(() => ({top: 200 - position, bottom: 220 - position, height: 20} as DOMRect));
  spyOn(scroll, 'getBoundingClientRect').and.returnValue({top: 60, bottom: 400} as DOMRect);
  spyOn(toolbar, 'getBoundingClientRect').and.returnValue({bottom: 100} as DOMRect);
  // Karma's Ionic test host hides standalone editors; simulate native focus.
  spyOnProperty(document, 'activeElement', 'get').and.returnValue(root);
  expect(selection.isCollapsed).toBeTrue();
  expect(selection.getRangeAt(0)).toBe(range);
  let position = 300;
  Object.defineProperty(scroll, 'scrollTop', {get: () => position, set: value => { position = value; }});
  window.dispatchEvent(new Event('resize'));
  setTimeout(() => {
   expect(scroll.scrollTop).toBe(92);
   cleanup(); expect(quill.scrollingContainer).toBe(root);
   scroll.remove(); toolbar.remove(); done();
  }, 60);
 });
 it('restores a late Android keyboard scroll only during focus opening', () => {
  const scroll = document.createElement('div');
  const root = document.createElement('div');
  const toolbar = document.createElement('div');
  let position = 24;
  Object.defineProperty(scroll, 'scrollTop', {get: () => position, set: value => { position = value; }});
  const active = spyOnProperty(document, 'activeElement', 'get').and.returnValue(document.body);
  const cleanup = bindEditorScroll({root, scrollingContainer: root}, scroll, toolbar);
  root.dispatchEvent(new Event('pointerdown'));
  active.and.returnValue(root);
  position = 600;
  window.dispatchEvent(new Event('keyboardDidShow'));
  expect(position).toBe(24);
  position = 100;
  window.dispatchEvent(new Event('keyboardDidShow'));
  expect(position).toBe(100);
  cleanup();
 });

});
