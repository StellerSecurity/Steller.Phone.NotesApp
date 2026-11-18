import { resolveFolderReference } from './folder-reference';
describe('Folder reference reconciliation', () => {
  const folders = [{ id: 'deleted-id', name: '', deleted: true, last_modified: 20 }, { id: 'active-id', name: 'Dudu', last_modified: 30 }];
  it('resolves a stale deleted ID through one active matching folder name', () => {
    expect(resolveFolderReference('deleted-id', 'Dudu', folders)).toEqual({ folder_id: 'active-id', folder: 'Dudu' });
  });
  it('keeps an active ID authoritative when a cached name is stale', () => {
    expect(resolveFolderReference('active-id', 'Old name', folders)).toEqual({ folder_id: 'active-id', folder: 'Dudu' });
  });
  it('retains support for legacy name-only notes', () => {
    expect(resolveFolderReference(null, ' dudu ', folders)).toEqual({ folder_id: 'active-id', folder: 'Dudu' });
  });
  it('does not revive a deleted folder when no replacement exists', () => {
    expect(resolveFolderReference('deleted-id', 'Removed', folders)).toEqual({ folder_id: null, folder: '' });
  });
  it('does not guess between duplicate names', () => {
    expect(resolveFolderReference('missing', 'Dudu', [...folders, { id: 'second', name: 'Dudu' }]).folder_id).toBe('missing');
  });
  it('does not let an old active row override a newer tombstone', () => {
    expect(resolveFolderReference('deleted-id', '', [...folders, { id: 'deleted-id', name: 'Old', last_modified: 10 }])).toEqual({ folder_id: null, folder: '' });
  });
  it('preserves explicit unfiled notes', () => {
    expect(resolveFolderReference(null, '', folders)).toEqual({ folder_id: null, folder: '' });
  });
});
