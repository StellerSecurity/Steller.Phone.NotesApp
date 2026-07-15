export interface BackgroundSyncOperation {
  opId: string;
  type: 'upload' | 'delete';
  payload: object;
  attempt?: number;
  nextAt?: number;
  createdAt?: number;
}

export interface BackgroundNotesSyncPlugin {
  replaceQueue(options: {
    operations: BackgroundSyncOperation[];
    uploadUrl: string;
    syncPlanUrl: string;
  }): Promise<void>;

  consumeCompleted(): Promise<{ opIds: string[] }>;

  configurePull(options: { downloadUrl: string }): Promise<void>;

  consumeDownloaded(): Promise<{ responses: Array<Record<string, unknown>> }>;

  clearDownloaded(): Promise<void>;
}
