import {Component, ElementRef, OnInit, ViewChild} from '@angular/core';
import {at} from "ionicons/icons";
import {CryptoService} from "../services/crypto.service";
import {ActivatedRoute, ParamMap, Router} from "@angular/router";
import {AlertController, IonModal, LoadingController, NavController, ToastController, ModalController, IonInput} from "@ionic/angular";
import {NotesService} from "../services/notes.service";
import { NoteLockedModalComponent } from '../note-locked-modal/note-locked-modal.component';
import { DeleteNoteModalComponent } from '../delete-note-modal/delete-note-modal.component';
import { TranslatorService } from '../services/translator.service';
import {SecretapiService} from "../services/secretapi.service";
import {Secret} from "../models/Secret";
import {sha512} from "js-sha512";
import { ShareSecretModalComponent } from '../share-secret-modal/share-secret-modal.component';
import { RichTextEditorComponent } from './rich-text-editor/rich-text-editor.component';
import {NotesApiV1Service} from "../services/notes-api-v1.service";
import {CryptoKeyService, packCipherBlob, unpackCipherBlob} from "../services/crypto-key.service";
import {firstValueFrom} from "rxjs";
import {SecureStorageService} from "../services/secure-storage.service";
const { v4: uuidv4 } = require('uuid');

declare var require: any;
var CryptoJS = require('crypto-js');

@Component({
    selector: 'app-add-note',
    templateUrl: './add-note.page.html',
    styleUrls: ['./add-note.page.scss'],
})
export class AddNotePage {

    @ViewChild(IonModal) modal: IonModal;

    public notes_password_input = "";

    private notes_id = null;

    private notes:any[] = [];

    private currentNote = null;

    public note_locked = false;

    public notes_password_stored = "";

    public notes_password_confirm = "";

    public passwordStrengthHelperText = "";

    public showPassword = false;
    public confirmShowPassword = false;
    public strongPass = false;
    public upperLower = false;
    public specialChar = false;

    public passwordStrength = 0;

    public note_text = "";

    public note_title = "";

    private saveTimeout: any = null;

    allTranslations:any;
    isEditingTitle: boolean = false;

    private liveNoteTimer?: number;
    private fetchLiveNoteBound = () => {}
    private typing = false;
    private typingTimeout: any;
    private isPaused = false;

    private stopSyncing = false;

    private livePoolingTimer: any = null;

    @ViewChild('titleInput', { static: false }) titleInputRef!: IonInput;
    @ViewChild('richTextEditorComponentRef') richTextEditorComponent!: RichTextEditorComponent;


    constructor(private cryptoService: CryptoService,
                public activatedRoute: ActivatedRoute,
                private navController: NavController,
                private notesService: NotesService,
                private crypto: CryptoKeyService,
                private secureStorageService: SecureStorageService,
                private toastController: ToastController,
                private modalCtrl: ModalController,
                private alertCtrl: AlertController,
                private notesApiV1Service: NotesApiV1Service,
                private translatorService: TranslatorService) {

        this.activatedRoute.paramMap.subscribe((params: ParamMap) => {

            this.notes = JSON.parse(this.notesService.getDecryptedNotes());

            // @ts-ignore
            this.notes_id = params.get('id');
            if(this.notes_id === null) {
                console.log('new note created');
                this.notes_id = uuidv4();
                return;
            }

            // @ts-ignore
            this.currentNote = this.notesService.findNoteById(this.notes_id, this.notes);

            // @ts-ignore
            if(this.currentNote.protected) {
                this.note_locked = true;
                this.askforNotePassword().then(r => {});
            }

            // @ts-ignore
            this.note_text = this.currentNote.text;

            // @ts-ignore
            if(this.currentNote.title !== undefined) {
                // @ts-ignore
                this.note_title = this.currentNote.title;
            } else {
                this.note_title = "Untitled";
            }

            this.startLiveNotePolling();

        });

    }

    ionViewDidEnter() {
        this.passwordStrengthHelperText = this.allTranslations.passwordAtLeastLength;
        if(this.note_text.length === 0) {
            setTimeout(() => {
                this.placeCursorAtEnd();
            }, 100);
        }

    }

    private placeCursorAtEnd() {
        const editorElem = this.richTextEditorComponent?.editorComponent?.textArea?.nativeElement;

        if (editorElem) {
            editorElem.focus();

            const selection = window.getSelection();
            const range = document.createRange();
            const lastChild = editorElem.lastChild;

            if (selection && range && lastChild) {
                range.selectNodeContents(editorElem);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }
    }

    public async shareStellarSecret() {
        if (this.richTextEditorComponent?.onLeave) {
            this.richTextEditorComponent.onLeave();
        }

        // 1. Create a new secret
        const addSecretModal = new Secret();
        const secret_id = uuidv4();

        addSecretModal.expires_at = "0"; // Assuming '0' means never expires
        addSecretModal.id = sha512(secret_id);

        let secretMessage = this.note_text;
        secretMessage = secretMessage.replace(/<br ?\/?>/g, "\n")
        const doc = new DOMParser().parseFromString(secretMessage, 'text/html');
        secretMessage = doc.body?.textContent?.trim() || '';

        // 3. Encrypt the secret using AES
        addSecretModal.message = CryptoJS.AES.encrypt(secretMessage, secret_id).toString();

        // 4. Open to Modal
        const modal = await this.modalCtrl.create({
            component: ShareSecretModalComponent,
            componentProps: {
                addSecretModal: addSecretModal,
                secret_id: secret_id,
            },
            cssClass: 'secret-modal',
            breakpoints: [0, 0.7],
            initialBreakpoint: 0.7,
        });

        await modal.present();
    }

    enableEditingTitle() {
        this.isEditingTitle = true;

        setTimeout(() => {
            this.titleInputRef?.setFocus();
        }, 100); // Slight delay ensures DOM updates
    }


    public noteTitleChange(event: any) {
        const newTitle = event.detail?.value || '';
        this.note_title = newTitle.trim();


        for(let i = 0; i < this.notes?.length; i++) {
            // @ts-ignore
            if(this.notes[i].id === this.notes_id) {
                // @ts-ignore
                this.notes[i].title = this.note_title;
                break;
            }
        }

        setTimeout(() => {
            this.save(event)
        }, 300)

    }

    ionViewWillEnter(): void {
        this.allTranslations = this.translatorService.allTranslations;
    }

    togglePasswordVisibility() {
        this.showPassword = !this.showPassword;
    }
    toggleConfirmPasswordVisibility() {
        this.confirmShowPassword = !this.confirmShowPassword;
    }

    startLiveNotePolling() {
        this.liveNoteTimer = window.setInterval(() => {
            if (this.isPaused || document.hidden || !navigator.onLine) return;
            this.fetchLiveNote();
        }, 30000);
    }

    pauseLiveSync() {
        this.isPaused = true;
    }

    resumeLiveSync() {
        this.isPaused = false;
        this.fetchLiveNote().then(r => {}); // grab latest once user stops editing
    }

    private stopLiveNotePolling() {
        if (this.liveNoteTimer) clearInterval(this.liveNoteTimer);
        window.removeEventListener('focus', this.fetchLiveNoteBound);
        window.removeEventListener('online', this.fetchLiveNoteBound);
    }

// your existing method (kept simple)
    private async fetchLiveNote() {

        if(this.stopSyncing) return;

        if(this.note_locked) return;

        if (this.typing) {
            console.log('Do not fetch live note');
            return;
        }
        if (this.notes_id == null) return;

        try {
            const user = await this.secureStorageService.getItem('ssUser');
            if(user) {
                this.notesApiV1Service.find(this.notes_id).then(async (note) => {
                    console.log('Fetched Live Note');
                    if(this.currentNote == null) return;
                    if (note.deleted) { await this.navController.navigateForward('/'); return; }

                    // @ts-ignore
                    if (note.protected !== this.currentNote.protected) {
                        console.log('Notes protection mismatch, redirect back' + note.protected);
                        await this.navController.navigateForward('/'); return;
                    }

                    if (!note.protected) this.notes_password_stored = "";

                    // @ts-ignore
                    if (this.currentNote.last_modified == note.last_modified) { console.log('Equal'); return; }
                    // @ts-ignore
                    if (this.currentNote.last_modified >  note.last_modified)  { console.log('Higher'); return; }

                    console.log('Note from server {encrypted, we have to decrypt it}.', note);

                    const blobText = unpackCipherBlob(note.text);
                    // @ts-ignore
                    note.text = await this.crypto.decryptText({ ...blobText, v: 1, aad_b64: btoa(this.notes_id) });

                    const blobTitle = unpackCipherBlob(note.title);
                    // @ts-ignore
                    note.title = await this.crypto.decryptText({ ...blobTitle, v: 1, aad_b64: btoa(this.notes_id+ '#title') });

                    console.log(note.title + " " + note.text);

                    // @ts-ignore
                    this.currentNote.text = note.text;

                    this.note_title = note.title;
                    this.note_text  = note.text;
                    // @ts-ignore
                    this.currentNote.text  = this.note_text;
                    // @ts-ignore
                    this.currentNote.title = this.note_title;

                    if (note.protected) {
                        console.log('Note is protected, lets decrypt it.')
                        const ok = this.decryptNote(this.notes_password_stored, note);
                        console.log('Note decrypted...');
                        if (!ok) { this.dismissModal().then(r => {}); this.navController.navigateForward('/'); }
                    }

                })
                .catch(() => { /* ignore; try again on next tick */ });
            }
        } catch (err) {
            // only gets here if your service rethrows
            console.error('Find notes not done.', err);
        }


    }

    // should be called on key enter.
    save(ev: any) {
        if(this.notes_id === null) return;
        if(this.note_locked) return;

        let value = " ";
        if(this.note_text.length > 0) {
            value = this.note_text;
        }

        // @ts-ignore
        let encryptedText = value;
        let decryptedText = value;

        let encryptedTitle = this.note_title;
        let decryptedTitle = this.note_title;

        // encrypt the text.
        if(this.notes_password_stored.length > 1) {
            encryptedText = this.cryptoService.encrypt(value, this.notes_password_stored);
            encryptedTitle = this.cryptoService.encrypt(this.note_title, this.notes_password_stored);
        }

        let protectedNote = false;

        if(this.currentNote !== null) {
            // @ts-ignore
            protectedNote = this.currentNote.protected;
        }

        const now = new Date();

        const datePart = now.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        const timePart = now.toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        const formattedDate = `${datePart} at ${timePart}`;

        // newly created note.
        const note = {
            "id": this.notes_id,
            "title": encryptedTitle ? encryptedTitle : formattedDate,
            "last_modified": Date.now(),
            "text": encryptedText,
            "protected": protectedNote,
            "auto_wipe": true,
        };

        // first time the user creates a note in history.
        if(this.notes === null) {
            // @ts-ignore
            this.notes = [note];
        } else {
            let found = false;

            // @ts-ignore
            for(let i = 0; i < this.notes.length; i++) {
                // @ts-ignore
                if(this.notes[i].id === this.notes_id) {
                    found = true;
                    // @ts-ignore
                    this.notes[i] = note;
                    // @ts-ignore
                    this.currentNote = note;
                    break;
                }
            }

            // no existing note found, meaning we´re creating a new one.
            if(!found) {
                // @ts-ignore
                this.notes.push(note);
                // @ts-ignore
                this.currentNote = note;
            }

            this.note_text = decryptedText;
            this.note_title = decryptedTitle;
        }

        this.storeNoteInStorage().then(r => {});
    }

    async storeNoteInStorage(serverSync = true) {

        if(this.notesService.appHasPasswordChallenge()) {
            // newly notes to save into storage.
            let encryptedNotesSave = this.cryptoService.encrypt(JSON.stringify(this.notes), this.notesService.getNotesAppPassword());
            // notes in the app is stored.
            this.notesService.setNotes(encryptedNotesSave);
        } else {
            this.notesService.setNotes(JSON.stringify(this.notes));
        }

        this.saveTimeout = window.setTimeout(() => {
            (async () => {
                try {
                    const user = await this.secureStorageService.getItem('ssUser');

                    if (serverSync && user) {
                        // If upload() returns Observable<...>
                        await this.notesApiV1Service.upload(0, this.notes)

                        if (this.liveNoteTimer == null) {
                            this.startLiveNotePolling();
                        }
                    }
                } catch (err) {
                    console.error('Upload notes not done.', err);
                }
            })();
        }, 500);

    }

    public back() {
        this.navController.back();
    }


    private async wrongPasswordEntered() {
        const toast = await this.toastController.create({
            message: this.allTranslations.passwordIsNotCorrectTryAgain,
            duration: 3000,
            position: 'bottom',
        });

        await toast.present();
        await this.askforNotePassword();
    }

    public async askforNotePassword() {
        // @ts-ignore
        const modal = await this.modalCtrl.create({
            component: NoteLockedModalComponent,
            cssClass: 'confirmation-popup'
        });

        modal.onDidDismiss().then(async (data) => {
            if (data && data.data) {
                const { confirm, inputValue } = data.data;
                if (confirm) {
                    this.notes_password_stored = inputValue;

                    console.log('Lets try to decrypt it..');
                    let decryptNote = this.decryptNote(this.notes_password_stored, this.currentNote);
                    if(!decryptNote) {
                        await this.wrongPasswordEntered();
                    } else {
                        await modal.dismiss();
                    }

                } else {
                    // Handle case when user cancels password input
                    this.back();
                }
            }
            if(data.role == "backdrop") {
                this.back();
            }
        });

        return await modal.present();

    }

    private decryptNote(notePassword: string, noteToDecrypt: any) {

        if(notePassword.length == 0) return false;

        let decryptedText = null;

        try {
            // @ts-ignore
            decryptedText = this.cryptoService.decrypt(noteToDecrypt.text, notePassword);
        } catch (e) {
            console.error(e);
            return false;
        }

        if(decryptedText == null) return false;
        if(decryptedText.length == 0) return false;

        let decryptedTitle = "";

        try {
            // @ts-ignore
            decryptedTitle = this.cryptoService.decrypt(noteToDecrypt.title, notePassword);
        } catch (e) {}

        // @ts-ignore
        this.currentNote.text = decryptedText;
        this.note_text = decryptedText;

        this.note_title = decryptedTitle;

        this.note_locked = false;

        return true;
    }

    public async dismissModal() {
        await this.modal.dismiss();
    }

    public notesPasswordChange() {

        this.passwordStrength = 0;

        if(this.notes_password_input.length == 0) {
            this.passwordStrengthHelperText = this.allTranslations.passwordAtLeastLength;
            return;
        }

        // Check password length
        if (this.notes_password_input.length <= 4) {
        } else {
            this.passwordStrength += 1;
        }

        // Check for mixed case
        if (this.notes_password_input.match(/[a-z]/) && this.notes_password_input.match(/[A-Z]/)) {
            this.passwordStrength += 1;
            this.upperLower = true;
        } else {
            this.upperLower = false;
        }

        // Check for numbers
        if (this.notes_password_input.match(/\d/)) {
            this.passwordStrength += 1;
        }

        // Check for special characters
        if (this.notes_password_input.match(/[^a-zA-Z\d]/)) {
            this.passwordStrength += 1;
            this.specialChar = true;
        } else {
            this.specialChar = false;
        }


        // Check password length
        if (this.notes_password_input.length >= 6) {
            this.passwordStrength += 1;
            this.strongPass = true;
        } else {
            this.strongPass = false;
        }


        // Return results
        if (this.passwordStrength < 2) {
            this.passwordStrengthHelperText = this.allTranslations.weakPassword;
        } else if (this.passwordStrength === 2) {
            this.passwordStrengthHelperText = this.allTranslations.averagePassword;
        } else if (this.passwordStrength === 3) {
            this.passwordStrengthHelperText = this.allTranslations.goodPassword;
        } else {
            this.passwordStrengthHelperText = this.allTranslations.greatPassword;
        }
    }


    public async lockNote() {

        if (this.notes_password_input !== this.notes_password_confirm) {
            const toast = await this.toastController.create({
                message: this.allTranslations.theTwoPasswordsDoesNotMatch,
                duration: 2500,
                position: 'bottom',
            });

            await toast.present();
            return;
        }

        if(this.notes_password_input.length < 2) {
            const toast = await this.toastController.create({
                message: this.allTranslations.thePasswordIsTooWeakPleaseMakeItStronger,
                duration: 3000,
                position: 'bottom',
            });

            await toast.present();
            return;
        }

        // @ts-ignore
        this.notes_password_stored = this.notes_password_input;

        // @ts-ignore
        let decryptedText = this.note_text;
        // @ts-ignore
        let decryptedTitle = this.note_title;

        // @ts-ignore
        let encryptedText = this.cryptoService.encrypt(this.note_text, this.notes_password_stored);
        // @ts-ignore
        let encryptedTitle  = this.cryptoService.encrypt(this.note_title, this.notes_password_stored);
        // @ts-ignore
        this.currentNote.protected = true;
        // @ts-ignore
        this.currentNote.text = encryptedText;
        // @ts-ignore
        this.currentNote.title = encryptedTitle;

        const newNotes = [];

        for (let i = 0; i < this.notes.length; i++) {
            const note = this.notes[i];
            if (note.id === this.notes_id) {
                const updated = {
                    ...note,                 // start from existing note
                    // @ts-ignore - currentNote is object-like at runtime
                    ...this.currentNote,     // merge fields from currentNote
                    last_modified: Date.now(),
                };
                newNotes.push(updated);    // push UPDATED clone
            } else {
                newNotes.push(note);       // push original
            }
        }

        this.notes = newNotes;

        await this.storeNoteInStorage();

        // @ts-ignore
        this.currentNote.text = decryptedText;
        // @ts-ignore
        this.currentNote.title = decryptedTitle;

        this.notes_password_confirm = "";
        this.notes_password_input = "";

        await this.dismissModal();
    }

    public async removeLock() {
        const alert = await this.alertCtrl.create({
            header: this.allTranslations.warningCap,
            subHeader: this.allTranslations.areYouSureYouWantToRemoveThePasswordForTheNote,
            buttons: [
                {
                    text: this.allTranslations.cancel,
                    role: 'cancel',
                    handler: () => {
                        // this.handlerMessage = 'Alert canceled';
                    },
                },         {
                    text: this.allTranslations.removeLock,
                    role: 'confirm',
                    handler: () => {
                        // @ts-ignore
                        for (let i = 0; this.notes.length > i; i++) {
                            // @ts-ignore
                            if (this.notes[i].id === this.notes_id) {
                                // @ts-ignore
                                this.notes[i].text = this.note_text; // ensure it is not encrypted text.
                                this.notes[i].title = this.note_title; // ensure it is not encrypted text.
                                this.notes[i].last_modified = Date.now();
                                // @ts-ignore
                                this.notes[i].protected = false;
                                // @ts-ignore
                                this.currentNote = this.notes[i];
                                this.notes_password_stored = "";
                                break;
                            }
                        }

                        this.stopSyncing = true;
                        this.notesApiV1Service.upload(0, this.notes);
                        this.stopSyncing = false;

                        // update.
                        this.storeNoteInStorage();
                        this.modal.dismiss();

                    },
                }],
        });

        await alert.present();
    }
    public async openLockModal() {
        this.save(null);
        await this.modal.present();
    }

    public getProtected() {
        // @ts-ignore
        return this.currentNote.protected;
    }
    public async deleteNote() {
        const modal = await this.modalCtrl.create({
            component: DeleteNoteModalComponent,
            cssClass: 'confirmation-popup',
            componentProps: {
                isSingleDelete: true,
            }
        });

        modal.onDidDismiss().then(async (data) => {
            if (data && data.data) {
                const { confirm } = data.data;
                if (confirm) {
                    // @ts-ignore
                    for (let i = 0; this.notes.length > i; i++) {
                        // @ts-ignore
                        if (this.notes[i].id === this.notes_id) {
                            this.notes[i].deleted = true;

                            try {
                                const user = await this.secureStorageService.getItem('ssUser');
                                if(user) {
                                    await this.notesApiV1Service.deleteNotes(this.notes[i].id);
                                }
                                } catch (err) {
                                // only gets here if your service rethrows
                                console.error('Failed to read ssUser', err);
                            }

                        // @ts-ignore
                            this.notes.splice(i, 1);
                            break;
                        }
                    }

                    // updated list will not have the current note.
                    await this.storeNoteInStorage(true);
                    this.currentNote = null;
                    await this.navController.navigateForward('/');
                } else {
                    // Handle case when user cancels password input
                }
            }
        });

        return await modal.present();
    }

    onSave(event: any): void {
        this.note_text = event;
        this.typing = true;
        this.typingTimeout = setTimeout(() => this.typing = false, 10000); // idle 1s

        // Clear any previous timeout
        clearTimeout(this.saveTimeout);

        // Set a new one — only trigger save if no new input for 1 second
        this.save(null);
    }

    ionViewWillLeave() {
        this.stopLiveNotePolling();
        if (this.richTextEditorComponent?.onLeave) {
            this.richTextEditorComponent.onLeave();
        }
    }

}
