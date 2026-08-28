import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';
import { QuillModule } from 'ngx-quill';

import { RichTextEditorComponent } from './rich-text-editor.component';
import { AppHapticsService } from '../../services/app-haptics.service';
import { TranslatorService } from '../../services/translator.service';

const formattingFixtures = [
  '<p>Line one</p><p>Line two</p><p>Line three</p>',
  '<p>Line one</p><p><br></p><p><br></p><p>Line four</p>',
  '<p><br></p><p><br></p><p><br></p>',
  '<p><br></p><p>Leading blank line</p>',
  '<p>Trailing blank lines</p><p><br></p><p><br></p>',
  '<h2>Heading</h2><p><br></p><p>Body</p>',
  '<ol><li>First</li><li>Second</li></ol>',
  '<ul><li>First</li><li>Second</li></ul>',
  '<p><strong>Bold</strong> <s>strike</s> <a href="https://example.com">link</a></p>',
  '<h3>Mixed</h3><ul><li><strong>Bold item</strong></li></ul><p><br></p><p>Tail</p>',
  '<p>Unicode: Grüezi 👋🏽 — こんにちは</p>',
  '<p>Image</p><p><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="></p>',
];

describe('RichTextEditorComponent', () => {
  let component: RichTextEditorComponent;
  let fixture: ComponentFixture<RichTextEditorComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [RichTextEditorComponent],
      imports: [
        FormsModule,
        IonicModule.forRoot(),
        TranslateModule.forRoot(),
        QuillModule.forRoot(),
      ],
      providers: [
        { provide: TranslatorService, useValue: { allTranslations: {} } },
        {
          provide: AppHapticsService,
          useValue: { tap: () => Promise.resolve(), success: () => Promise.resolve(), error: () => Promise.resolve() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RichTextEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('preserves typed paragraph and blank-line boundaries after rehydration', async () => {
    const emitted: string[] = [];
    component.noteChange.subscribe((value) => emitted.push(value));

    component.quill.setText('test\ntest\n\n\ntest\n', 'user');
    const savedHtml = emitted[emitted.length - 1];

    expect(savedHtml).toBe('<p>test</p><p>test</p><p><br></p><p><br></p><p>test</p>');

    const reopenedFixture = TestBed.createComponent(RichTextEditorComponent);
    const reopened = reopenedFixture.componentInstance;
    reopened.note_text = savedHtml;
    reopenedFixture.detectChanges();
    await reopenedFixture.whenStable();
    reopenedFixture.detectChanges();

    expect(reopened.quill.root.innerHTML).toBe(savedHtml);
    expect(reopened.quill.getText()).toBe('test\ntest\n\n\ntest\n');

    reopenedFixture.destroy();
  });

  it('preserves repeated Shift+Enter lines and blank lines after rehydration', async () => {
    const emitted: string[] = [];
    component.noteChange.subscribe((value) => emitted.push(value));
    const shiftEnter = component.quillModules.keyboard.bindings.preserveShiftEnterLine.handler;
    let cursor = 0;

    const type = (text: string, followingBreaks: number) => {
      component.quill.insertText(cursor, text, 'user');
      cursor += text.length;
      for (let index = 0; index < followingBreaks; index += 1) {
        shiftEnter({ index: cursor, length: 0 });
        cursor += 1;
      }
    };

    type('test', 1);
    type('test', 1);
    type('test', 1);
    type('test', 2);
    type('test', 2);
    type('test', 2);
    type('test', 0);

    const expectedHtml = [
      '<p>test</p>',
      '<p>test</p>',
      '<p>test</p>',
      '<p>test</p>',
      '<p><br></p>',
      '<p>test</p>',
      '<p><br></p>',
      '<p>test</p>',
      '<p><br></p>',
      '<p>test</p>',
    ].join('');
    const savedHtml = emitted[emitted.length - 1];
    expect(savedHtml).toBe(expectedHtml);

    const reopenedFixture = TestBed.createComponent(RichTextEditorComponent);
    const reopened = reopenedFixture.componentInstance;
    reopened.note_text = savedHtml;
    reopenedFixture.detectChanges();
    await reopenedFixture.whenStable();
    reopenedFixture.detectChanges();

    expect(reopened.quill.root.innerHTML).toBe(expectedHtml);
    expect(reopened.quill.getText()).toBe(
      'test\ntest\ntest\ntest\n\ntest\n\ntest\n\ntest\n'
    );

    reopenedFixture.destroy();
  });

  it('handles real Shift+Enter keyboard events without dropping one break per gap', async () => {
    const emitted: string[] = [];
    component.noteChange.subscribe((value) => emitted.push(value));
    component.quill.focus();
    let cursor = 0;

    const pressShiftEnter = () => {
      component.quill.setSelection(cursor, 0, 'silent');
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      component.quill.root.dispatchEvent(event);
      expect(event.defaultPrevented).toBeTrue();
      cursor += 1;
    };

    const type = (text: string, followingBreaks: number) => {
      component.quill.insertText(cursor, text, 'user');
      cursor += text.length;
      for (let index = 0; index < followingBreaks; index += 1) {
        pressShiftEnter();
      }
    };

    type('test', 2);
    type('test', 3);
    type('test', 3);
    type('test', 2);
    type('test', 0);

    const expectedText = 'test\n\ntest\n\n\ntest\n\n\ntest\n\ntest\n';
    expect(component.quill.getText()).toBe(expectedText);

    const savedHtml = emitted[emitted.length - 1];
    const reopenedFixture = TestBed.createComponent(RichTextEditorComponent);
    const reopened = reopenedFixture.componentInstance;
    reopened.note_text = savedHtml;
    reopenedFixture.detectChanges();
    await reopenedFixture.whenStable();
    reopenedFixture.detectChanges();

    expect(reopened.quill.getText()).toBe(expectedText);
    reopenedFixture.destroy();
  });

  it('handles WebView insertLineBreak events that bypass keydown', async () => {
    const emitted: string[] = [];
    component.noteChange.subscribe((value) => emitted.push(value));
    component.quill.focus();
    let cursor = 0;

    const insertWebViewLineBreak = () => {
      component.quill.setSelection(cursor, 0, 'silent');
      const event = new InputEvent('beforeinput', {
        inputType: 'insertLineBreak',
        bubbles: true,
        cancelable: true,
      });
      component.quill.root.dispatchEvent(event);
      expect(event.defaultPrevented).toBeTrue();
      cursor += 1;
    };

    const type = (text: string, followingBreaks: number) => {
      component.quill.insertText(cursor, text, 'user');
      cursor += text.length;
      for (let index = 0; index < followingBreaks; index += 1) {
        insertWebViewLineBreak();
      }
    };

    type('test', 2);
    type('test', 3);
    type('test', 3);
    type('test', 2);
    type('test', 0);

    const expectedText = 'test\n\ntest\n\n\ntest\n\n\ntest\n\ntest\n';
    expect(component.quill.getText()).toBe(expectedText);

    const reopenedFixture = TestBed.createComponent(RichTextEditorComponent);
    const reopened = reopenedFixture.componentInstance;
    reopened.note_text = emitted[emitted.length - 1];
    reopenedFixture.detectChanges();
    await reopenedFixture.whenStable();
    reopenedFixture.detectChanges();

    expect(reopened.quill.getText()).toBe(expectedText);
    reopenedFixture.destroy();
  });

  it('preserves line boundaries when reopening a legacy plain-text note', async () => {
    const reopenedFixture = TestBed.createComponent(RichTextEditorComponent);
    const reopened = reopenedFixture.componentInstance;
    const migratedValues: string[] = [];
    reopened.noteChange.subscribe((value) => migratedValues.push(value));
    reopened.note_text = 'test\ntest\n\n\ntest';
    reopenedFixture.detectChanges();
    await reopenedFixture.whenStable();
    reopenedFixture.detectChanges();

    expect(reopened.quill.root.innerHTML).toBe(
      '<p>test</p><p>test</p><p><br></p><p><br></p><p>test</p>'
    );
    expect(reopened.quill.getText()).toBe('test\ntest\n\n\ntest\n');
    expect(migratedValues[migratedValues.length - 1]).toBe(
      '<p>test</p><p>test</p><p><br></p><p><br></p><p>test</p>'
    );

    reopenedFixture.destroy();
  });

  [
    'test\ntest<br><br><br>test',
    '<p>test\ntest</p><p><br></p><p><br></p><p>test</p>',
  ].forEach((legacyHtml, index) => {
    it(`preserves line boundaries in mixed legacy HTML fixture ${index + 1}`, async () => {
      const reopenedFixture = TestBed.createComponent(RichTextEditorComponent);
      const reopened = reopenedFixture.componentInstance;
      reopened.note_text = legacyHtml;
      reopenedFixture.detectChanges();
      await reopenedFixture.whenStable();
      reopenedFixture.detectChanges();

      expect(reopened.quill.root.innerHTML).toBe(
        '<p>test</p><p>test</p><p><br></p><p><br></p><p>test</p>'
      );
      expect(reopened.quill.getText()).toBe('test\ntest\n\n\ntest\n');

      reopenedFixture.destroy();
    });
  });

  it('does not turn pretty-printed HTML whitespace into note lines', async () => {
    const reopenedFixture = TestBed.createComponent(RichTextEditorComponent);
    const reopened = reopenedFixture.componentInstance;
    reopened.note_text = '<p>test</p>\n<p>test</p>';
    reopenedFixture.detectChanges();
    await reopenedFixture.whenStable();
    reopenedFixture.detectChanges();

    expect(reopened.quill.root.innerHTML).toBe('<p>test</p><p>test</p>');
    expect(reopened.quill.getText()).toBe('test\ntest\n');

    reopenedFixture.destroy();
  });

  formattingFixtures.forEach((html, index) => {
    it(`keeps formatting fixture ${index + 1} idempotent across repeated mobile round trips`, () => {
      component.quill.clipboard.dangerouslyPasteHTML(html, 'silent');
      const first = component.quill.root.innerHTML;

      component.quill.clipboard.dangerouslyPasteHTML(first, 'silent');
      const second = component.quill.root.innerHTML;

      component.quill.clipboard.dangerouslyPasteHTML(second, 'silent');
      expect(component.quill.root.innerHTML).toBe(second);
    });
  });
});
