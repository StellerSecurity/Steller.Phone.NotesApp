export { generateBackupCode, backupCode } from './backup-format';
export function runBackupCrypto(op: 'encrypt' | 'decrypt', text: string, code: string, signal?: AbortSignal,
  url = new URL('live/backup.worker.js', document.baseURI).href): Promise<string> {
  if (signal?.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'));
  return new Promise((resolve, reject) => {
    const worker = new Worker(url);
    const abort = () => done(new DOMException('Cancelled', 'AbortError'));
    const timer = setTimeout(() => done(new Error('backupCryptoFailed')), 90000);
    let settled = false;
    function done(error?: Error, value?: string) {
      if (settled) return; settled=true; clearTimeout(timer); signal?.removeEventListener('abort', abort); worker.terminate();
      if (error) reject(error); else resolve(value!);
    }
    signal?.addEventListener('abort', abort, {once:true});
    worker.onerror = () => done(new Error('backupCryptoFailed'));
    worker.onmessage = ({data}) => data?.ok && typeof data.text==='string' ? done(undefined,data.text) : done(new Error(data?.error || 'backupCryptoFailed'));
    worker.postMessage({op,text,code}); text=''; code='';
  });
}
