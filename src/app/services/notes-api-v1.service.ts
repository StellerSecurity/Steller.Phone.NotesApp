// services/notes-api-v1.service.ts
import { Injectable } from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {firstValueFrom, Observable} from 'rxjs';
import {NoteV1} from "../models/NoteV1";
import {CryptoKeyService, extractPlainEAK, packCipherBlob} from "./crypto-key.service";
import {CryptoService} from "./crypto.service";
import {StorageEncryptionService} from "./storage-encryption.service";
import {SecureStorageService} from "./secure-storage.service";

@Injectable({ providedIn: 'root' })
export class NotesApiV1Service {
    // 🔧 adjust this to your backend root, e.g. '/api/v1/notecontroller/'
    private base = 'https://stellarprivatenotesuiappapiprod-dmefgreabahpcsbm.swedencentral-01.azurewebsites.net/api/v1/notescontroller';

    constructor(private http: HttpClient,
                private secureStorageService: SecureStorageService,
                private crypto: CryptoKeyService, private storageEncryption: StorageEncryptionService) { }

    // Upload a batch changed since 'sinceMs'
    async upload(sinceMs: number, notes: NoteV1[], opId?: string): Promise<Object> {

        let bundle = await this.storageEncryption.getBundleJson();

        let eakB64 = await this.secureStorageService.getItem("ssEakB64");
        if(eakB64 !== null) {
            await this.crypto.importEAK(eakB64);
        }

        // BRUGEREN LOGGER PÅ --> VI BRUGER, BRUGERENS PASSWORD TIL

        let encryptedNotes = [];
        for(let i = 0; i < notes.length; i++) {
            const enc = await this.crypto.encryptText(notes[i].text ?? '', notes[i].id);
            const encTitle = await this.crypto.encryptText(notes[i].title ?? '', notes[i].id + '#title');
            let copiedNote = notes[i];
            copiedNote.text = packCipherBlob(enc);
            copiedNote.title = packCipherBlob(encTitle);
            encryptedNotes.push(copiedNote);
        }

        const TOKEN = await this.secureStorageService.getItem("ssToken");
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

        return this.http.post<{ upload: any; download: any; noop: any; conflicts: any }>(
            `${this.base}/sync-plan`,
            { deleted_ids: deletedIds, notes: [] },
            { headers }
        );
    }
}