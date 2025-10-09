export interface NoteV1 {
    id: string;                 // uuid or local-temp id
    title: string;
    text: string;
    protected: boolean;
    auto_wipe: boolean;
    deleted: boolean;
    last_modified: number;      // ms epoch
}