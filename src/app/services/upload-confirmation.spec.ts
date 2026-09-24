import { HttpHeaders } from '@angular/common/http';
import { of } from 'rxjs';
import { confirmUpload } from './upload-confirmation';
import { nextNoteVersion } from '../utils/note-version';
import { CryptoKeyService } from './crypto-key.service';

describe('Verified upload compatibility', () => {
  const payload = { notes: [{ id: 'a', text: 'cipher', last_modified: 100, checksum_hmac: 'stable' }] };
  it('accepts explicit confirmation without extra downloads', async () => {
    const http = { post: jasmine.createSpy('post') };
    await confirmUpload(http as any, '/', new HttpHeaders(), payload, { note_ack_v1: true });
    expect(http.post).not.toHaveBeenCalled();
  });
  it('verifies a legacy server response through the existing download endpoint', async () => {
    const http = { post: jasmine.createSpy('post').and.returnValue(of(payload)) };
    await confirmUpload(http as any, '/', new HttpHeaders(), payload, { ok: true });
    expect(http.post.calls.mostRecent().args[0]).toBe('/download');
  });
  it('rejects a legacy success that actually ignored a clock-skewed edit', async () => {
    const http = { post: () => of({ notes: [{ ...payload.notes[0], last_modified: 9000 }] }) };
    await expectAsync(confirmUpload(http as any, '/', new HttpHeaders(), payload, { ok: true })).toBeRejected();
  });
  it('rejects different content at the same timestamp', async () => {
    const http = { post: () => of({ notes: [{ ...payload.notes[0], checksum_hmac: 'different' }] }) };
    await expectAsync(confirmUpload(http as any, '/', new HttpHeaders(), payload, { ok: true })).toBeRejected();
  });
  it('keeps local versions increasing after a clock reset', () => {
    expect(nextNoteVersion([{ last_modified: 9000 }], 1000)).toBe(9001);
    expect(nextNoteVersion([{ last_modified: 1000 }], 1000)).toBe(1001);
  });
  it('produces stable keyed confirmations independent of encryption nonces', async () => {
    const cryptoService = new CryptoKeyService();
    await cryptoService.importEAK(btoa('12345678901234567890123456789012'));
    const checksum = await cryptoService.noteChecksum('same note');
    const first = await cryptoService.encryptText('same note', 'note');
    const second = await cryptoService.encryptText('same note', 'note');
    expect(first.iv_b64).not.toBe(second.iv_b64);
    expect(await cryptoService.noteChecksum('same note')).toBe(checksum);
    expect(await cryptoService.noteChecksum('different note')).not.toBe(checksum);
    await cryptoService.importEAK(btoa('22345678901234567890123456789012'));
    expect(await cryptoService.noteChecksum('same note')).not.toBe(checksum);
  });
  it('does not acknowledge ignored metadata in an old queued payload without a checksum', async () => {
    const note = { id: 'a', text: 'cipher', title: '', last_modified: 100, favorite: true };
    const http = { post: () => of({ notes: [{ ...note, favorite: false }] }) };
    await expectAsync(confirmUpload(http as any, '/', new HttpHeaders(), { notes: [note] }, { ok: true })).toBeRejected();
  });

});
