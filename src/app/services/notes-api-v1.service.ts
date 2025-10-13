// services/notes-api-v1.service.ts
import { Injectable } from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {firstValueFrom, Observable} from 'rxjs';
import {NoteV1} from "../models/NoteV1";
import {CryptoKeyService, extractPlainEAK, packCipherBlob} from "./crypto-key.service";
import {CryptoService} from "./crypto.service";
import {SecureStorageService} from "./secure-storage.service";

@Injectable({ providedIn: 'root' })
export class NotesApiV1Service {
    private base = 'https://stellarprivatenotesuiappapiprod-dmefgreabahpcsbm.swedencentral-01.azurewebsites.net/api/v1/notescontroller';

    constructor(private http: HttpClient,
                private secureStorageService: SecureStorageService,
                private crypto: CryptoKeyService) { }

    // Upload a batch changed since 'sinceMs'
    async upload(sinceMs: number, notes: ReadonlyArray<NoteV1>, opId?: string): Promise<object> {
        console.log('Sending notes to server..');

        const eakB64 = await this.secureStorageService.getItem("ssEakB64");
        if (eakB64) await this.crypto.importEAK(eakB64);

        const encryptedNotes: NoteV1[] = [];
        for (const n of notes) {
            const encText  = await this.crypto.encryptText(n.text  ?? '', n.id);
            const encTitle = await this.crypto.encryptText(n.title ?? '', n.id + '#title');

            // make a NEW object; do not mutate `n`
            encryptedNotes.push({
                ...n,
                text:  packCipherBlob(encText),
                title: packCipherBlob(encTitle),
            });
        }

        const TOKEN = await this.secureStorageService.getItem("ssToken");
        const headers = new HttpHeaders().set('Authorization', `Bearer ${TOKEN}`);

        const body = {
            op_id: opId ?? crypto?.randomUUID?.() ?? String(Date.now()),
            since: sinceMs || 0,
            notes: encryptedNotes,
        };

        return await firstValueFrom(this.http.post(`${this.base}/upload`, body, { headers }));
    }


// Download deltas since 'sinceMs'
    async download(
        sinceMs: number,
        limit = 1000
    ): Promise<{ notes: NoteV1[]; has_more?: boolean; watermark?: number }> {
        const TOKEN = await this.secureStorageService.getItem('ssToken');
        const headers = new HttpHeaders().set('Authorization', `Bearer ${TOKEN ?? ''}`);

        return firstValueFrom(
            this.http.post<{ notes: NoteV1[]; has_more?: boolean; watermark?: number }>(
                `${this.base}/download`,
                { since: sinceMs || 0, limit },
                { headers }
            )
        );
    }
    async find(id: string): Promise<NoteV1> {
        const TOKEN = await this.secureStorageService.getItem("ssToken");
        const headers = new HttpHeaders().set('Authorization', `Bearer ${TOKEN}`);
        return firstValueFrom(
            this.http.post<NoteV1>(`${this.base}/find`, { id }, { headers })
        );
    }


    async deleteNotes(deletedIds: string[]) {
        const TOKEN = await this.secureStorageService.getItem("ssToken");
        const headers = new HttpHeaders().set('Authorization', `Bearer ${TOKEN}`);

        return await firstValueFrom(this.http.post<{ upload: any; download: any; noop: any; conflicts: any }>(
            `${this.base}/sync-plan`,
            { deleted_ids: deletedIds, notes: [] },
            { headers }
        ));
    }
}