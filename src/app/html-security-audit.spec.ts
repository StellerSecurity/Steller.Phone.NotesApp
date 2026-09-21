import { DomSanitizer } from '@angular/platform-browser';
import { bindSafeNotePaste } from './add-note/rich-text-editor/safe-note-paste';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { QuillModule } from 'ngx-quill';
import { preserveNoteLineBreaks } from './add-note/rich-text-editor/preserve-note-line-breaks';

@Component({template: `<quill-editor [(ngModel)]="html" [modules]="modules" [sanitize]="true" (onEditorCreated)="created($event)"></quill-editor>`})
class AuditHost {
  html = '';
  quill: any;
  cleanup?: () => void;
  constructor(private sanitizer: DomSanitizer) {}
  created(quill: any) { this.quill = quill; this.cleanup = bindSafeNotePaste(quill, this.sanitizer); }
  ngOnDestroy() { this.cleanup?.(); }
  modules = {toolbar: false, clipboard: {matchers: [[1, preserveNoteLineBreaks]]}};
}

describe('Untrusted stored HTML in the actual ngx-quill input path', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({declarations:[AuditHost], imports:[FormsModule, QuillModule.forRoot()]}).compileComponents();
    (window as any).__stellarXssAudit = 0;
  });
  afterEach(() => { delete (window as any).__stellarXssAudit; });
  const payloads: [string,string][] = [
    ['image error', '<p>safe</p><img src="data:image/png;base64,AA==" onerror="window.__stellarXssAudit=1">'],
    ['SVG load', '<svg onload="window.__stellarXssAudit=2"></svg><p>safe</p>'],
    ['script tag', '<script>window.__stellarXssAudit=3</script><p>safe</p>'],
    ['iframe srcdoc', '<iframe srcdoc="&lt;script&gt;parent.__stellarXssAudit=4&lt;/script&gt;"></iframe>'],
    ['javascript link', '<p><a href="javascript:window.__stellarXssAudit=5">link</a></p>'],
    ['encoded javascript link', '<p><a href="jav&#x61;script:window.__stellarXssAudit=6">link</a></p>'],
    ['image loadstart', '<img src="data:image/png;base64,AA==" onloadstart="window.__stellarXssAudit=7">'],
  ];
  for (const [name, html] of payloads) {
    it('does not execute ' + name, async () => {
      const fixture = TestBed.createComponent(AuditHost);
      fixture.componentInstance.html = html;
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise(resolve => setTimeout(resolve, 150));
      const root = fixture.nativeElement.querySelector('.ql-editor');
      console.log('XSS AUDIT', name, 'executed=', (window as any).__stellarXssAudit,
        'retained event attributes=', !!root?.querySelector('[onerror],[onload],[onloadstart],[srcdoc]'));
      expect((window as any).__stellarXssAudit).withContext(name).toBe(0);
      expect(root?.querySelector('a[href^="javascript:"]')).toBeNull();
      fixture.destroy();
    });
  }
  it('sanitizes pasted HTML and replaces the selection without losing formatting', async () => {
    const fixture = TestBed.createComponent(AuditHost);
    fixture.componentInstance.html = '<p>replace me</p>';
    fixture.detectChanges();
    await fixture.whenStable();
    const quill = fixture.componentInstance.quill;
    quill.setSelection(0, 10);
    const data = new DataTransfer();
    data.setData('text/html', '<p><strong>safe</strong></p><img src="data:image/png;base64,AA==" onerror="window.__stellarXssAudit=8">');
    quill.root.dispatchEvent(new ClipboardEvent('paste', {clipboardData: data, bubbles: true, cancelable: true}));
    await new Promise(resolve => setTimeout(resolve, 150));
    expect((window as any).__stellarXssAudit).toBe(0);
    expect(quill.getText()).toContain('safe');
    expect(quill.getText()).not.toContain('replace me');
    expect(quill.root.querySelector('strong')?.textContent).toBe('safe');
    fixture.destroy();
  });

  it('preserves legacy line breaks, headings, lists, links and embedded images', async () => {
    const fixture = TestBed.createComponent(AuditHost);
    fixture.componentInstance.html = '<h2>Title</h2><p><strong>bold</strong> <s>strike</s></p><p>test</p><p>test</p><p>test</p><ul><li>item</li></ul><p><a href="https://example.com">link</a><img src="data:image/png;base64,AA=="></p>';
    fixture.detectChanges();
    await fixture.whenStable();
    const quill = fixture.componentInstance.quill;
    expect(quill.getText()).toContain('test\ntest\ntest\n');
    expect(quill.root.querySelector('h2')?.textContent).toBe('Title');
    expect(quill.root.querySelector('strong')?.textContent).toBe('bold');
    expect(quill.root.querySelector('s')?.textContent).toBe('strike');
    expect(quill.root.querySelector('li')?.textContent).toBe('item');
    expect(quill.root.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
    expect(quill.root.querySelector('img')).not.toBeNull();
    fixture.destroy();
  });

});
