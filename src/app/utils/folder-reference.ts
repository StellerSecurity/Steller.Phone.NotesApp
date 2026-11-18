type SyncFolder = { id?: string | null; name?: string; deleted?: boolean; last_modified?: number };

export function resolveFolderReference(id: unknown, name: unknown, folders: SyncFolder[]): { folder_id: string | null; folder: string } {
  const folderId = typeof id === 'string' && id.trim() ? id.trim() : null;
  const folderName = typeof name === 'string' ? name.trim() : '';
  const latest = new Map<string, SyncFolder>();
  for (const folder of folders) {
    if (!folder.id) continue;
    const previous = latest.get(folder.id);
    if (!previous || Number(folder.last_modified || 0) > Number(previous.last_modified || 0)
      || (Number(folder.last_modified || 0) === Number(previous.last_modified || 0) && folder.deleted)) latest.set(folder.id, folder);
  }
  const referenced = folderId ? latest.get(folderId) : undefined;
  if (referenced && !referenced.deleted && referenced.name?.trim()) return { folder_id: folderId, folder: referenced.name.trim() };
  const matches = [...latest.values()].filter(folder => !folder.deleted && folder.name?.trim()
    && folder.name.trim().toLowerCase() === folderName.toLowerCase());
  if (folderName && matches.length === 1) return { folder_id: matches[0].id!, folder: matches[0].name!.trim() };
  if (referenced?.deleted) return { folder_id: null, folder: '' };
  return { folder_id: folderId, folder: folderName };
}
