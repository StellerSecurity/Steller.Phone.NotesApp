import { LocalAccountProfiles, LocalAccountProfile } from './local-account-profiles';

describe('Encrypted local account profiles', () => {
  let data: Map<string, any>, secrets: Map<string, string>, disk: any, secure: any, profiles: LocalAccountProfiles;
  const profile = (): LocalAccountProfile => ({ notes: [{ id: 'synthetic', title: 'Private unsynced note' }], folders: [{ name: 'Private folder' }], outbox: [], pendingDeletes: ['deleted-id'], foldersPending: true });
  beforeEach(() => {
    data = new Map(); secrets = new Map();
    disk = { get: async (key: string) => structuredClone(data.get(key) ?? null),
      set: async (key: string, value: any) => { data.set(key, structuredClone(value)); }, remove: async (key: string) => { data.delete(key); } };
    secure = { getItem: async (key: string) => secrets.get(key) || null,
      setItem: async (key: string, value: string) => { secrets.set(key, value); }, removeItem: async (key: string) => { secrets.delete(key); } };
    profiles = new LocalAccountProfiles(disk, secure);
  });
  it('keeps private account data encrypted and round-trips it exactly', async () => {
    await profiles.save('123', profile());
    expect(JSON.stringify([...data.values()])).not.toContain('Private');
    expect(await profiles.load('123')).toEqual(profile());
    expect(await profiles.load('456')).toBeNull();
  });
  it('fails closed on missing device keys rather than opening an empty account', async () => {
    await profiles.save('123', profile()); secrets.clear();
    await expectAsync(profiles.load('123')).toBeRejected();
    expect(data.size).toBe(1);
  });
  it('rejects altered ciphertext and cross-account copies', async () => {
    await profiles.save('123', profile()); await profiles.save('456', profile());
    const names = [...data.keys()];
    data.set(names[1], data.get(names[0]));
    await expectAsync(profiles.load('456')).toBeRejected();
    data.get(names[0]).cipher = 'AA==';
    await expectAsync(profiles.load('123')).toBeRejected();
  });
  it('recovers an interrupted switch after process death with original notes and session', async () => {
    data.set('notes', 'encrypted-original-notes'); data.set('notes.sync.outbox.v1', [{ pending: true }]);
    secrets.set('ssUser', 'original-user'); secrets.set('ssToken', 'synthetic-original-token');
    await profiles.begin('123', profile());
    data.set('notes', 'partial-new-account'); secrets.set('ssUser', 'partial-new-user'); secrets.delete('ssToken');
    const restarted = new LocalAccountProfiles(disk, secure);
    expect(await restarted.recover()).toBeTrue();
    expect(data.get('notes')).toBe('encrypted-original-notes');
    expect(data.get('notes.sync.outbox.v1')).toEqual([{ pending: true }]);
    expect(secrets.get('ssUser')).toBe('original-user');
    expect(secrets.get('ssToken')).toBe('synthetic-original-token');
    expect(data.has('notes.local-profile-switch.v1')).toBeFalse();
    expect(secrets.has('ssLocalProfileSwitch')).toBeFalse();
  });
  it('never rolls back a completed switch on the next start', async () => {
    data.set('notes', 'old'); await profiles.begin('123', profile());
    data.set('notes', 'new'); await profiles.commit();
    expect(await profiles.recover()).toBeFalse(); expect(data.get('notes')).toBe('new');
    expect(secrets.has('ssLocalProfileSwitch')).toBeFalse();
  });
  it('does not clear anything when a recovery snapshot is missing', async () => {
    data.set('notes', 'keep-this'); data.set('notes.local-profile-switch.v1', { version: 1, from: '123' });
    await expectAsync(profiles.recover()).toBeRejected();
    expect(data.get('notes')).toBe('keep-this');
    expect(data.has('notes.local-profile-switch.v1')).toBeTrue();
  });
});
