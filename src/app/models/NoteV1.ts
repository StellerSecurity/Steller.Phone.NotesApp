export interface NoteV1 {
  id: string;
  /** Last server version this local edit is based on. */
  base_version?: number;
  checksum_hmac?: string;
  title?: string;
  text: string;
  protected?: boolean;
  favorite?: boolean;
  pinned?: boolean;
  folder?: string | null;
  folder_id?: string | null;
  last_modified?: number;
  deleted_at?: number;
  auto_wipe?: boolean;
  deleted?: boolean;
}
