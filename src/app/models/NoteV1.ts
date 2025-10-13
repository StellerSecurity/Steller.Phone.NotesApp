export interface NoteV1 {
  id: string;
  title?: string;
  text: string;
  protected?: boolean;
  last_modified?: number;
  auto_wipe?: boolean;
  deleted?: boolean;
}
