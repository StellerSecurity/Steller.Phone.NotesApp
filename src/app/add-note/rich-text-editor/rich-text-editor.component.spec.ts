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

    component.quill.setText('test\ntest\n\ntest\n', 'user');
    const savedHtml = emitted[emitted.length - 1];

    expect(savedHtml).toBe('<p>test</p><p>test</p><p><br></p><p>test</p>');

    const reopenedFixture = TestBed.createComponent(RichTextEditorComponent);
    const reopened = reopenedFixture.componentInstance;
    reopened.note_text = savedHtml;
    reopenedFixture.detectChanges();
    await reopenedFixture.whenStable();
    reopenedFixture.detectChanges();

    expect(reopened.quill.root.innerHTML).toBe(savedHtml);
    expect(reopened.quill.getText()).toBe('test\ntest\n\ntest\n');

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
