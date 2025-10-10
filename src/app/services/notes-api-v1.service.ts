// services/notes-api-v1.service.ts
import { Injectable } from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import { Observable } from 'rxjs';
import {NoteV1} from "../models/NoteV1";

@Injectable({ providedIn: 'root' })
export class NotesApiV1Service {
    // 🔧 adjust this to your backend root, e.g. '/api/v1/notecontroller/'
    private base = 'https://stellarprivatenotesuiappapiprod-dmefgreabahpcsbm.swedencentral-01.azurewebsites.net/api/v1/notescontroller';

    constructor(private http: HttpClient) {}

    // Upload a batch changed since 'sinceMs'
    upload(sinceMs: number, notes: NoteV1[], opId?: string): Observable<any> {
        const TOKEN = '84458|BfbOAqi21gQKyopsMRfcq44dJHshPElGu3huQZFi3db388ba';
        const headers = new HttpHeaders().set('Authorization', `Bearer ${TOKEN}`);

        const body = {
            op_id: opId ?? crypto?.randomUUID?.() ?? String(Date.now()),
            since: sinceMs || 0,
            notes,
        };

        return this.http.post(`${this.base}/upload`, body, { headers });
    }


// Download deltas since 'sinceMs'
    download(
        sinceMs: number,
        limit = 1000
    ): Observable<{ notes: NoteV1[]; has_more?: boolean; watermark?: number }> {
        const TOKEN = '84458|BfbOAqi21gQKyopsMRfcq44dJHshPElGu3huQZFi3db388ba';
        const headers = new HttpHeaders().set('Authorization', `Bearer ${TOKEN}`);

        return this.http.post<{ notes: NoteV1[]; has_more?: boolean; watermark?: number }>(
            `${this.base}/download`,
            { since: sinceMs || 0, limit },
            { headers }
        );
    }
    find(id: string): Observable<NoteV1> {
        const TOKEN = '84458|BfbOAqi21gQKyopsMRfcq44dJHshPElGu3huQZFi3db388ba';
        const headers = new HttpHeaders().set('Authorization', `Bearer ${TOKEN}`);

        return this.http.post<NoteV1>(
            `${this.base}/find`,
            { id },
            { headers }
        );
    }

    deleteNotes(deletedIds: string[]) {
        const TOKEN = '84458|BfbOAqi21gQKyopsMRfcq44dJHshPElGu3huQZFi3db388ba';
        const headers = new HttpHeaders().set('Authorization', `Bearer ${TOKEN}`);

        return this.http.post<{ upload: any; download: any; noop: any; conflicts: any }>(
            `${this.base}/sync-plan`,
            { deleted_ids: deletedIds, notes: [] },
            { headers }
        );
    }
}