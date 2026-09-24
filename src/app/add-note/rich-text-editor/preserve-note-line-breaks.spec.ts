import Quill from 'quill';
import { preserveNoteLineBreaks, preserveNoteSpaces } from './preserve-note-line-breaks';

describe('note HTML line breaks', () => {
  let host: HTMLDivElement;
  let styles: HTMLStyleElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    styles = document.createElement('style');
    // Exercise import without computed block display, as during Ionic mounting.
    styles.textContent = '.ql-clipboard p, .ql-clipboard h2, .ql-clipboard li { display: inline !important; }';
    document.head.appendChild(styles);
  });

  afterEach(() => {
    host.remove();
    styles.remove();
  });

  function editor(preserve = true): Quill {
    return new Quill(host, { modules: {
      toolbar: false,
      clipboard: { matchVisual: false, matchers: preserve ? [[3, preserveNoteSpaces], [1, preserveNoteLineBreaks]] : [] }
    }});
  }

  it('demonstrates the original paragraph-merging failure without the matcher', () => {
    const quill = editor(false);
    quill.setContents(quill.clipboard.convert('<p>test</p><p>test</p><p>test</p>'));
    expect(quill.getText()).toBe('testtesttest\n');
  });

  it('preserves three lines through five save/reopen conversions', () => {
    const quill = editor();
    let html = '<p>test</p><p>test</p><p>test</p>';
    for (let cycle = 0; cycle < 5; cycle++) {
      quill.setContents(quill.clipboard.convert(html));
      expect(quill.getText()).toBe('test\ntest\ntest\n');
      html = quill.root.innerHTML;
    }
  });

  it('preserves empty paragraphs without doubling existing line breaks', () => {
    const quill = editor();
    quill.setContents(quill.clipboard.convert('<p>test</p><p><br></p><p>test</p>'));
    expect(quill.getText()).toBe('test\n\ntest\n');
  });

  it('preserves heading and inline bold formatting', () => {
    const quill = editor();
    quill.setContents(quill.clipboard.convert('<h2>Title</h2><p><strong>test</strong></p><p>end</p>'));
    expect(quill.getText()).toBe('Title\ntest\nend\n');
    expect(quill.getFormat(0, 5)['header']).toBe(2);
    expect(quill.getFormat(6, 4)['bold']).toBeTrue();
  });

  it('preserves separate bullet items', () => {
    const quill = editor();
    quill.setContents(quill.clipboard.convert('<ul><li>one</li><li>two</li></ul>'));
    expect(quill.getText()).toBe('one\ntwo\n');
    expect(quill.getFormat(0, 3)['list']).toBe('bullet');
    expect(quill.getFormat(4, 3)['list']).toBe('bullet');
  });

  it('does not turn CSS spacing into extra blank lines on repeated imports', () => {
    styles.textContent = '.ql-clipboard p { display:block; margin:0; height:20px; } .ql-clipboard p + p { margin-top:100px; }';
    const quill = editor();
    let html = '<p>first</p><p>second</p><p><br></p><p>last</p>';
    for (let cycle = 0; cycle < 5; cycle++) {
      quill.setContents(quill.clipboard.convert(html));
      expect(quill.getText()).toBe('first\nsecond\n\nlast\n');
      html = quill.root.innerHTML;
    }
  });
});
