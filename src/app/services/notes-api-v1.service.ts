// services/notes-api-v1.service.ts
import { Injectable } from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {firstValueFrom, Observable} from 'rxjs';
import {NoteV1} from "../models/NoteV1";
import {CryptoKeyService, packCipherBlob} from "./crypto-key.service";
import {CryptoService} from "./crypto.service";

@Injectable({ providedIn: 'root' })
export class NotesApiV1Service {
    // 🔧 adjust this to your backend root, e.g. '/api/v1/notecontroller/'
    private base = 'https://stellarprivatenotesuiappapiprod-dmefgreabahpcsbm.swedencentral-01.azurewebsites.net/api/v1/notescontroller';

    constructor(private http: HttpClient, private crypto: CryptoKeyService) { }

    // Upload a batch changed since 'sinceMs'
    async upload(sinceMs: number, notes: NoteV1[], opId?: string): Promise<Object> {

        let bundle = localStorage.getItem("bundle");
        let password = localStorage.getItem("password");

        console.log(10);

        // @ts-ignore
        await this.crypto.importFromServerBundle(JSON.parse(bundle), password);

        let encryptedNotes = [];
        for(let i = 0; i < notes.length; i++) {
            const enc = await this.crypto.encryptText(notes[i].text ?? '', notes[i].id);
            const encTitle = await this.crypto.encryptText(notes[i].title ?? '', notes[i].id + '#title');
            let copiedNote = notes[i];
            copiedNote.text = packCipherBlob(enc);
            copiedNote.title = packCipherBlob(encTitle);
            encryptedNotes.push(copiedNote);
        }

        const TOKEN = '84458|BfbOAqi21gQKyopsMRfcq44dJHshPElGu3huQZFi3db388ba';
        const headers = new HttpHeaders().set('Authorization', `Bearer ${TOKEN}`);

        notes = encryptedNotes;

        const body = {
            op_id: opId ?? crypto?.randomUUID?.() ?? String(Date.now()),
            since: sinceMs || 0,
            notes,
        };

        return await firstValueFrom(this.http.post(`${this.base}/upload`, body, { headers }));
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