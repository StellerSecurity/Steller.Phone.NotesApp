import { packCipherBlob } from '@stellarsecurity/stellar-crypto';
import { NoteConflictService, conflictPreview } from './note-conflict.service';
import { RealtimeNotesService, validRealtimeGrant } from './realtime-notes.service';
import { of, Subject, throwError } from 'rxjs';
import { OutboxStorage } from './outbox-storage.service';
import { SyncWorkerService } from './sync-worker.service';
import { OutboxOp } from '../models/Sync';

const op = (id: string): OutboxOp => ({
  opId: id, type: 'upload', payload: { op_id: id, since: 0, notes: [] }, attempt: 0, nextAt: 0,
});

function queue() {
  let saved: any = [];
  const storage = {
    create: async () => {},
    get: async () => JSON.parse(JSON.stringify(saved)),
    set: jasmine.createSpy('set').and.callFake(async (_key: string, value: any) => {
      await Promise.resolve();
      saved = JSON.parse(JSON.stringify(value));
    }),
  };
  const native = { consumeCompleted: async (): Promise<string[]> => [], replaceQueue: async () => {} };
  return { outbox: new OutboxStorage(storage as any, native as any), storage, native };
}

function workerFor(outbox: OutboxStorage, http: any) {
  const worker = new SyncWorkerService(http, outbox, {} as any,
    { getItem: async () => 'test-token' } as any,
    { getPendingMutation: () => null, syncNeedsAttention$: { next: () => {} } } as any);
  spyOn<any>(worker, 'isOnline').and.resolveTo(true);
  return worker;
}

describe('Durable outbox concurrency and recovery', () => {
  it('retains concurrent enqueues', async () => {
    const { outbox } = queue();
    await Promise.all([outbox.enqueue(op('a')), outbox.enqueue(op('b'))]);
    expect((await outbox.getAll()).map(x => x.opId)).toEqual(['a', 'b']);
  });

  it('does not lose a new edit when an older upload finishes', async () => {
    const { outbox } = queue();
    await outbox.enqueue(op('a'));
    const response = new Subject<object>();
    let started!: () => void;
    const sending = new Promise<void>(resolve => started = resolve);
    const worker = workerFor(outbox, { post: () => { started(); return response; } });
    const run = worker.trySync();
    await sending;
    await outbox.enqueue(op('b'));
    response.next({});
    response.complete();
    await run;
    expect((await outbox.getAll()).map(x => x.opId)).toEqual(['b']);
  });

  it('updates only the failed operation while new edits are queued', async () => {
    const { outbox } = queue();
    await outbox.enqueue(op('a'));
    let started!: () => void;
    const sending = new Promise<void>(resolve => started = resolve);
    const response = new Subject<object>();
    const worker = workerFor(outbox, { post: () => { started(); return response; } });
    const run = worker.trySync();
    await sending;
    await outbox.enqueue(op('b'));
    response.error({ status: 503 });
    await run;
    const all = await outbox.getAll();
    expect(all.map(x => x.opId)).toEqual(['a', 'b']);
    expect(all[0].attempt).toBe(1);
    expect(all[1].attempt).toBe(0);
  });

  it('serializes overlapping worker triggers before authentication resolves', async () => {
    const { outbox } = queue();
    await outbox.enqueue(op('a'));
    const http = { post: jasmine.createSpy('post').and.returnValue(of({})) };
    const worker = workerFor(outbox, http);
    await Promise.all([worker.trySync(), worker.trySync(), worker.trySync()]);
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it('retains exhausted operations with a bounded recovery delay', async () => {
    const { outbox } = queue();
    await outbox.enqueue({ ...op('a'), attempt: 8 });
    await workerFor(outbox, { post: () => throwError(() => ({ status: 500 })) }).trySync();
    const all = await outbox.getAll();
    expect(all.length).toBe(1);
    expect(all[0].attempt).toBe(9);
    expect(all[0].nextAt! - Date.now()).toBeGreaterThan(290_000);
    expect(all[0].nextAt! - Date.now()).toBeLessThanOrEqual(300_000);
  });

  it('recovers previously parked operations on explicit retry/resume', async () => {
    const { outbox } = queue();
    await outbox.enqueue({ ...op('a'), attempt: 9, nextAt: Number.MAX_SAFE_INTEGER });
    await workerFor(outbox, { post: () => of({}) }).retryPending();
    expect(await outbox.getAll()).toEqual([]);
  });

  it('does not poison the queue after a persistence failure', async () => {
    const { outbox, storage } = queue();
    await outbox.getAll();
    // A failed write must not reject all later operations.
    storage.set.and.rejectWith(new Error('disk unavailable'));
    await expectAsync(outbox.enqueue(op('a'))).toBeRejected();
    storage.set.and.callFake(async () => {});
    await expectAsync(outbox.getAll()).toBeResolved();
  });
  it('retains all 200 operations during concurrent saves and acknowledgements', async () => {
    const { outbox } = queue();
    await Promise.all(Array.from({ length: 100 }, (_, i) => outbox.enqueue(op('old-' + i))));
    await Promise.all([
      ...Array.from({ length: 100 }, (_, i) => outbox.enqueue(op('new-' + i))),
      ...Array.from({ length: 100 }, (_, i) => outbox.drop(['old-' + i])),
    ]);
    const all = await outbox.getAll();
    expect(all.length).toBe(100);
    expect(new Set(all.map(item => item.opId)).size).toBe(100);
    expect(all.every(item => item.opId.startsWith('new-'))).toBeTrue();
  });
  it('does not upload offline', async () => {
    const { outbox } = queue();
    await outbox.enqueue(op('a'));
    const http = { post: jasmine.createSpy('post') };
    const worker = workerFor(outbox, http);
    (worker as any).isOnline.and.resolveTo(false);
    await worker.trySync();
    expect(http.post).not.toHaveBeenCalled();
    expect((await outbox.getAll()).length).toBe(1);
  });
  it('does not upload without authentication', async () => {
    const { outbox } = queue();
    await outbox.enqueue(op('a'));
    const http = { post: jasmine.createSpy('post') };
    const worker = workerFor(outbox, http);
    (worker as any).secure = { getItem: async () => null };
    await worker.trySync();
    expect(http.post).not.toHaveBeenCalled();
    expect((await outbox.getAll()).length).toBe(1);
  });
  it('honours backoff until retry is requested', async () => {
    const { outbox } = queue();
    await outbox.enqueue({ ...op('a'), nextAt: Date.now() + 60000 });
    const http = { post: jasmine.createSpy('post').and.returnValue(of({})) };
    const worker = workerFor(outbox, http);
    await worker.trySync();
    expect(http.post).not.toHaveBeenCalled();
    await worker.retryPending();
    expect(http.post).toHaveBeenCalledTimes(1);
  });
  it('does not resurrect native-completed operations during failure updates', async () => {
    const { outbox, native } = queue();
    await outbox.enqueue(op('a'));
    native.consumeCompleted = async () => ['a'];
    await outbox.update('a', item => ({ ...item, attempt: 5 }));
    expect(await outbox.getAll()).toEqual([]);
  });
  it('does not acknowledge a newer pending edit with an older upload', async () => {
    const { outbox } = queue();
    const old = op('a');
    old.payload.notes = [{ id: 'note', text: 'old', last_modified: 100 }] as any;
    await outbox.enqueue(old);
    const worker = workerFor(outbox, { post: () => of({}) });
    const clear = jasmine.createSpy('clear');
    (worker as any).notesState = { getPendingMutation: () => ({ type: 'update', localUpdatedAt: 200 }), clearPendingMutation: clear, syncNeedsAttention$: { next: () => {} } };
    await worker.trySync();
    expect(clear).not.toHaveBeenCalled();
  });

  it('does not reschedule native work when the queue is only inspected', async () => {
    const { outbox, native } = queue();
    await outbox.getAll();
    const mirror = spyOn(native, 'replaceQueue').and.resolveTo();
    await outbox.enqueue(op('a'));
    expect(mirror).toHaveBeenCalledTimes(1);
    await Promise.all([outbox.getAll(), outbox.getAll(), outbox.peekBatch()]);
    expect(mirror).toHaveBeenCalledTimes(1);
  });

  it('keeps a falsely acknowledged legacy upload durable and visible', async () => {
    const { outbox } = queue();
    const edit = op('clock');
    edit.payload.notes = [{ id: 'note', text: 'cipher', last_modified: 100, checksum_hmac: 'current' }];
    await outbox.enqueue(edit);
    const worker = workerFor(outbox, { post: (url: string) => of(url.endsWith('upload')
      ? { ok: true } : { notes: [{ ...edit.payload.notes[0], last_modified: 9000 }] }) });
    const attention = jasmine.createSpy('attention');
    (worker as any).notesState.syncNeedsAttention$ = { next: attention };
    await worker.trySync();
    expect((await outbox.getAll()).length).toBe(1);
    expect(attention).toHaveBeenCalledWith(true);
  });

});


describe('Outbox stress', () => {
  it('survives 1000 enqueues, 500 acknowledgements and 500 failure updates interleaved', async () => {
    const { outbox } = queue();
    const started = performance.now();
    await Promise.all(Array.from({length: 500}, (_, i) => outbox.enqueue(op('old-' + i))));
    await Promise.all(Array.from({length: 500}, (_, i) => [
      outbox.enqueue(op('new-' + i)),
      outbox.update('old-' + i, item => ({...item, attempt: (item.attempt ?? 0) + 1})),
      outbox.drop(['old-' + i]),
    ]).reduce((all, row) => all.concat(row), [] as Promise<void>[]));
    const all = await outbox.getAll();
    expect(all.length).toBe(500);
    expect(new Set(all.map(x => x.opId)).size).toBe(500);
    expect(all.every(x => x.opId.startsWith('new-') && x.attempt === 0)).toBeTrue();
    console.log('STRESS 2000 outbox mutations ms:', Math.round(performance.now() - started));
  }, 60000);

  it('retains 150 uploads across 20 outage/recovery rounds and drains exactly once', async () => {
    const { outbox } = queue();
    await Promise.all(Array.from({length: 150}, (_, i) => outbox.enqueue(op('recover-' + i))));
    let failing = true;
    const sent: string[] = [];
    const worker = workerFor(outbox, {post: (_url: string, body: any) => {
      if (failing) return throwError(() => ({status: 503}));
      sent.push(body.op_id);
      return of({note_ack_v1: true});
    }});
    for (let i = 0; i < 20; i++) {
      await worker.retryPending();
      expect((await outbox.getAll()).length).toBe(150);
    }
    failing = false;
    for (let i = 0; i < 3; i++) await Promise.all(Array.from({length: 25}, () => worker.retryPending()));
    expect(await outbox.getAll()).toEqual([]);
    expect(sent.length).toBe(150);
    expect(new Set(sent).size).toBe(150);
  }, 60000);
});

 describe('Seeded randomized queue stress',()=>{
  for(const seed of [17,97,733,2026,65537]) it('preserves every operation across randomized concurrent batches, seed '+seed,async()=>{
   const q=queue().outbox;
   let state=seed;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
   const expected=new Map<string,any>();let sequence=0;
   for(let batch=0;batch<100;batch++) {
    const work:Promise<any>[]=[];
    for(let k=0;k<10;k++) {
     const choice=random()%4;const id='op-'+(random()%80);
     if(choice<2){const item:any={opId:id,type:choice===0?'upload':'delete',payload:{op_id:id,since:0,notes:choice===0?[{id:'note-'+(random()%10),text:'random æøå\n'+random(),last_modified:++sequence}]:[],deleted_ids:choice===1?['note-'+(random()%10)]:[]},attempt:0,nextAt:0};expected.set(id,JSON.parse(JSON.stringify(item)));work.push(q.enqueue(item));}
     else if(choice===2){expected.delete(id);work.push(q.drop([id]));}
     else {if(expected.has(id))expected.get(id).attempt++;work.push(q.update(id,item=>({...item,attempt:(item.attempt??0)+1})));}
    }
    await Promise.all(work);
    expect(await q.getAll()).withContext('seed '+seed+' batch '+batch).toEqual([...expected.values()]);
   }
  });
 });


describe('Realtime security and fallback',()=>{
 const grant=(url='wss://notes-test.webpubsub.azure.com/client/hubs/notes?access_token=synthetic')=>({enabled:true,url,expires_at:Date.now()+30000});
 it('accepts only short-lived WSS grants on Azure notes hub',()=>{expect(validRealtimeGrant(grant())).toBeTrue();});
 it('rejects insecure, foreign and credential-bearing URLs',()=>{
  for(const url of ['ws://notes-test.webpubsub.azure.com/client/hubs/notes?access_token=x','wss://evil.example/client/hubs/notes?access_token=x','wss://user:pass@notes-test.webpubsub.azure.com/client/hubs/notes?access_token=x','wss://notes-test.webpubsub.azure.com/client/hubs/other?access_token=x'])expect(validRealtimeGrant(grant(url))).toBeFalse();
 });
 it('rejects expired, long-lived and disabled grants',()=>{
  expect(validRealtimeGrant({...grant(),expires_at:Date.now()-1})).toBeFalse();
  expect(validRealtimeGrant({...grant(),expires_at:Date.now()+3600000})).toBeFalse();
  expect(validRealtimeGrant({...grant(),enabled:false})).toBeFalse();
 });
 it('keeps fallback untouched when negotiation fails',async()=>{
  const service:any=new RealtimeNotesService({post:()=>throwError(()=>new Error('offline'))} as any,{isLoggedIn:true} as any,{getItem:async()=> 'synthetic'} as any);
  await service.connect(0);expect(service.socket).toBeUndefined();expect(service.retry).toBeDefined();service.stop();
 });
 it('does not open a socket after logout during negotiation',async()=>{
  const reply=new Subject<any>();let started!:()=>void;const ready=new Promise<void>(resolve=>started=resolve);
  const service:any=new RealtimeNotesService({post:()=>{started();return reply;}} as any,{isLoggedIn:true} as any,{getItem:async()=> 'synthetic'} as any);
  const connecting=service.connect(0);await ready;service.stop();reply.next(grant());reply.complete();await connecting;
  expect(service.socket).toBeUndefined();expect(service.retry).toBeUndefined();
 });
 it('closes sockets and cancels renewal on logout',()=>{
  const service:any=new RealtimeNotesService({} as any,{} as any,{} as any);const close=jasmine.createSpy('close');service.socket={close};service.stop();expect(close).toHaveBeenCalled();expect(service.socket).toBeUndefined();
 });

 it('rejects a negotiated grant if the account token changed while waiting',async()=>{
  let token='account-A';const reply=new Subject<any>();let started!:()=>void;const ready=new Promise<void>(r=>started=r);
  const service:any=new RealtimeNotesService({post:()=>{started();return reply;}} as any,{isLoggedIn:true} as any,{getItem:async()=>token} as any);
  const connecting=service.connect(0);await ready;token='account-B';reply.next({enabled:true,url:'wss://notes-test.webpubsub.azure.com/client/hubs/notes?access_token=synthetic',expires_at:Date.now()+30000});reply.complete();await connecting;
  expect(service.socket).toBeUndefined();service.stop();
 });
 it('does not dispatch stale-account hints',async()=>{
  const service:any=new RealtimeNotesService({} as any,{isLoggedIn:false} as any,{getItem:async()=> 'account-B'} as any);
  const dispatch=spyOn(window,'dispatchEvent');await service.hint(0,'account-A');expect(dispatch).not.toHaveBeenCalled();service.stop();
 });
});

describe('Explicit multi-device conflict choices', () => {
 const blob = (text: string) => packCipherBlob({iv_b64:'AAAAAAAAAAAAAAAA',ct_b64:btoa('0123456789abcdef'+text)});
 async function setup(choice: string, during?: (ctx: any) => void) {
  const q = queue().outbox;
  let local: any[] = [{id:'n',text:'local text',title:'local',last_modified:200,base_version:100}];
  let token = 'account-a';
  const sent = {id:'n',text:blob('local text'),title:blob('local'),last_modified:200,base_version:100,edit_session:'desktop-111111111111'};
  await q.enqueue({opId:'conflict',type:'upload',payload:{op_id:'conflict',since:0,notes:[sent]},conflict:true});
  const remote: any = {id:'n',text:blob('remote text'),title:blob('remote'),last_modified:300};
  const state: any = {getNotes:()=>JSON.stringify(local),setNotes:(s:string)=>{local=JSON.parse(s);},appHasPasswordChallenge:()=>false,shouldAskForPassword:()=>false,
    flushPersistence:async()=>{},getPendingMutation:()=>null,clearPendingMutation:()=>{},setNoteIsUpdatedSubject:()=>{},refreshRequested$:{next:()=>{}},syncNeedsAttention$:{next:()=>{}}};
  const context: any = {q,state,remote,edit:()=>{local[0].text='new typing';local[0].last_modified=400;},logout:()=>{token='account-b';},local:()=>local};
  const alerts: any = {create:jasmine.createSpy('create').and.callFake(async () => ({present:async()=>{},dismiss:async()=>{},onDidDismiss:async()=>{
    during?.(context); return choice==='later'?{role:'cancel'}:{role:'confirm',data:{values:choice}};
  }}))};
  const keys: any = {importEAK:async()=>{},decryptText:async(b:any)=>atob(b.ct_b64).slice(16),encryptText:async(t:string)=>({v:1,iv_b64:'AAAAAAAAAAAAAAAA',ct_b64:btoa('0123456789abcdef'+t)})};
  const resolver = new NoteConflictService(q,state,{getItem:async(k:string)=>k==='ssToken'?token:null} as any,keys,{} as any,{post:()=>of({notes:[remote]})} as any,alerts);
  return {...context,resolver,alerts};
 }
 beforeEach(()=>{spyOnProperty(document,'hidden','get').and.returnValue(false);spyOnProperty(navigator,'onLine','get').and.returnValue(true);});
 it('Later preserves both local text and encrypted pending operation',async()=>{
  const c=await setup('later');await c.resolver.check();expect(c.local()[0].text).toBe('local text');expect((await c.q.getAll()).length).toBe(1);
 });
 it('Later also postpones older queued snapshots of the same note',async()=>{
  const c=await setup('later');const first=(await c.q.getAll())[0];await c.q.enqueue({...first,opId:'older',payload:{...first.payload,op_id:'older',notes:first.payload.notes.map((n:any)=>({...n,last_modified:199}))}});await c.resolver.check();await c.resolver.check();expect(c.alerts.create).toHaveBeenCalledTimes(1);expect((await c.q.getAll()).length).toBe(2);
 });
 it('choosing server applies only the chosen version and removes the conflict',async()=>{
  const c=await setup('server');await c.resolver.check();expect(c.local()[0].text).toBe('remote text');expect((await c.q.getAll()).length).toBe(0);
 });
 it('decrypts folder metadata when choosing the server version',async()=>{
  const c=await setup('server');c.remote.folder=blob('Work');c.remote.folder_id='folder-a';await c.resolver.check();expect(c.local()[0].folder).toBe('Work');expect(c.local()[0].folder_id).toBe('folder-a');
 });
 it('choosing local queues a fresh conditional write before removing old operation',async()=>{
  const c=await setup('local');await c.resolver.check();const items=await c.q.getAll();expect(items.length).toBe(1);expect(items[0].opId).not.toBe('conflict');expect(items[0].payload.notes[0].base_version).toBe(300);expect(items[0].conflict).not.toBeTrue();expect(c.local()[0].text).toBe('local text');
 });
 it('does not discard typing done while version dialog is open',async()=>{
  const c=await setup('server',x=>x.edit());await c.resolver.check();expect(c.local()[0].text).toBe('new typing');expect((await c.q.getAll()).length).toBe(1);
 });
 it('account switch while dialog is open prevents applying the choice',async()=>{
  const c=await setup('server',x=>x.logout());await c.resolver.check();expect(c.local()[0].text).toBe('local text');expect((await c.q.getAll()).length).toBe(1);
 });
 it('failed local persistence retains encrypted conflicting operation',async()=>{
  const c=await setup('server');c.state.flushPersistence=async()=>{throw new Error('disk full');};await c.resolver.check();expect((await c.q.getAll()).length).toBe(1);
 });
 it('restoring a remotely deleted note uses a new UUID and re-encryption',async()=>{
  const c=await setup('local');c.remote.deleted=true;await c.resolver.check();const items=await c.q.getAll();expect(items.length).toBe(1);expect(items[0].payload.notes[0].id).not.toBe('n');expect(items[0].payload.notes[0].base_version).toBe(0);expect(c.local().some((n:any)=>n.id==='n')).toBeFalse();
 });
 it('conflict operations do not block unrelated uploads in the queue',async()=>{
  const c=await setup('later');await c.q.enqueue({opId:'other',type:'upload',payload:{op_id:'other',since:0,notes:[]},nextAt:0});expect((await c.q.peekBatch()).map((o:any)=>o.opId)).toEqual(['other']);
 });
 it('choosing a version never removes a later edit or another note',async()=>{
  const c=await setup('later');await c.q.enqueue({opId:'later',type:'upload',payload:{op_id:'later',since:0,notes:[{id:'n',text:'new',last_modified:500},{id:'other',text:'safe',last_modified:1}]}});await c.q.discardChosenVersions({n:200});const items=await c.q.getAll();expect(items.length).toBe(1);expect(items[0].payload.notes.length).toBe(2);
 });
 it('escapes HTML previews and never previews protected content',()=>{
  expect(conflictPreview({text:'<img src=x onerror=alert(1)>'})).not.toContain('<img');expect(conflictPreview({protected:true,text:'secret'})).not.toContain('secret');
 });
});
