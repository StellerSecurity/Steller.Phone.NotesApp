// services/notes-api-v1.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {NoteV1} from "../models/NoteV1";

@Injectable({ providedIn: 'root' })
export class NotesApiV1Service {
    // 🔧 adjust this to your backend root, e.g. '/api/v1/notecontroller/'
    private base = 'https://stellarprivatenotesuiappapiprod-dmefgreabahpcsbm.swedencentral-01.azurewebsites.net/api/v1/notescontroller';

    constructor(private http: HttpClient) {}

    // Upload a batch changed since 'sinceMs'
    upload(sinceMs: number, notes: NoteV1[], opId?: string): Observable<any> {
        const body = {
            op_id: opId ?? crypto?.randomUUID?.() ?? String(Date.now()),
            since: sinceMs || 0,
            notes,
        };
        return this.http.post(`${this.base}/upload?token=84458|BfbOAqi21gQKyopsMRfcq44dJHshPElGu3huQZFi3db388ba`, body);
    }

    // Download deltas since 'sinceMs'
    download(sinceMs: number, limit = 1000): Observable<{ notes: NoteV1[]; has_more?: boolean; watermark?: number }> {
        const params = new HttpParams().set('since', String(sinceMs || 0)).set('limit', String(limit));
        return this.http.post<{ notes: NoteV1[]; has_more?: boolean; watermark?: number }>(`${this.base}/download`, { params });
    }

    find(id: string): Observable<NoteV1> {
        const params = new HttpParams().set('id', id);
        return this.http.post<NoteV1>(`${this.base}/find?token=84458|BfbOAqi21gQKyopsMRfcq44dJHshPElGu3huQZFi3db388ba`, { params });
    }

    async deleteNotes(deletedIds: any) {
        const res = await fetch(`${this.base}/sync-plan?token=84458|BfbOAqi21gQKyopsMRfcq44dJHshPElGu3huQZFi3db388ba`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deleted_ids: deletedIds, notes: [] }),
        });
        if (!res.ok) throw new Error(`plan failed: ${res.status}`);
        return res.json(); // { upload, download, noop, conflicts }
    }

}

export interface DownloadResponseV1 {
    notes: NoteV1[];
    has_more?: boolean;
    watermark?: number;
}