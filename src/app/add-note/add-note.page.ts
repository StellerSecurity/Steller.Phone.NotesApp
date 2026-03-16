import { Component, ViewChild, OnDestroy } from '@angular/core';
import { ActivatedRoute, ParamMap } from '@angular/router';
import {
  AlertController,
  IonInput,
  IonModal,
  ModalController,
  NavController,
  ToastController,
} from '@ionic/angular';

import { Subscription } from 'rxjs';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { CryptoService } from '../services/crypto.service';
import { NotesService } from '../services/notes.service';
import { TranslatorService } from '../services/translator.service';
import { Secret } from '../models/Secret';
import { sha512 } from 'js-sha512';
import { ShareSecretModalComponent } from '../share-secret-modal/share-secret-modal.component';
import { RichTextEditorComponent } from './rich-text-editor/rich-text-editor.component';
import { NotesApiV1Service } from '../services/notes-api-v1.service';
import { SecureStorageService } from '../services/secure-storage.service';
import { DataService } from '../services/data.service';
import { NoteLockedModalComponent } from '../note-locked-modal/note-locked-modal.component';
import { DeleteNoteModalComponent } from '../delete-note-modal/delete-note-modal.component';
import { NoteV1 } from '../models/NoteV1';
import { AuthService } from '../services/auth.service';
import { evaluatePasswordStrength, isPasswordLongEnough } from '../utils/password-policy';

// ✅ New: use Stellar Crypto SDK
import { unpackCipherBlob, decryptTextWithMK } from '@stellarsecurity/stellar-crypto';

// ✅ keep CommonJS requires (no ES imports)
declare var require: any;
const { v4: uuidv4 } = require('uuid');
const CryptoJS = require('crypto-js');

@Component({
  selector: 'app-add-note',
  templateUrl: './add-note.page.html',
  styleUrls: ['./add-note.page.scss'],
})
export class AddNotePage implements OnDestroy {
  @ViewChild(IonModal) modal!: IonModal;
  @ViewChild('titleInput', { static: false }) titleInputRef!: IonInput;
  @ViewChild('richTextEditorComponentRef') richTextEditorComponent!: RichTextEditorComponent;

  public notes_password_input = '';
  public note_locked = false;
  public notes_password_stored = '';
  public notes_password_confirm = '';
  public passwordStrengthHelperText = '';
  public showPassword = false;
  public confirmShowPassword = false;
  public strongPass = false;
  public upperLower = false;
  public specialChar = false;
  public passwordStrength = 0;
  public note_text = '';
  public note_title = '';
  public allTranslations: any;
  public isEditingTitle = false;

  private notes_id: string | null = null;
  private notes: NoteV1[] = [];
  private currentNote: NoteV1 | null = null;

  private saveTimeout: any = null;
  private liveNoteTimer?: number;
  private typing = false;
  private typingTimeout: any;
  private isPaused = false;
  private stopSyncing = false;
  private newlyCreatedNote = false;

  private fetchLiveNoteBound = () => {};
  private routeSub?: Subscription;

  // 🔐 Master key held in RAM (derived from EAK)
  private mkRaw: Uint8Array | null = null;
  private saveDebounceTimer: any = null;
  private encryptedProtectedText = '';
  private encryptedProtectedTitle = '';
  private noteUnlockModalOpen = false;
  private appStateListener?: PluginListenerHandle;
  private readonly visibilityChangeHandler = () => {
    if (document.hidden) {
      this.relockProtectedNote();
      return;
    }

    this.promptUnlockForProtectedNote().then(() => {});
  };

  // ✅ Prevent “save on leave” from re-creating a note right after delete (or similar flows)
  private suppressAutoSave = false;

  constructor(
    private cryptoService: CryptoService,
    public activatedRoute: ActivatedRoute,
    private navController: NavController,
    private notesService: NotesService,
    private secureStorageService: SecureStorageService,
    private toastController: ToastController,
    private modalCtrl: ModalController,
    private dataService: DataService,
    private alertCtrl: AlertController,
    private notesApiV1Service: NotesApiV1Service,
    private translatorService: TranslatorService,
    private authService: AuthService
  ) {
    this.routeSub = this.activatedRoute.paramMap.subscribe((params: ParamMap) => {
      const decrypted = this.notesService.getDecryptedNotes();
      try {
        this.notes = decrypted ? (JSON.parse(decrypted) as NoteV1[]) : [];
      } catch (error) {
        this.notes = [];
      }

      this.notes_id = params.get('id');
      if (this.notes_id === null) {
        // New note
        this.newlyCreatedNote = true;
        this.notes_id = uuidv4();
        return;
      }

      this.currentNote = this.notesService.findNoteById(this.notes_id, this.notes) as NoteV1 | null;

      if (!this.currentNote) {
        // defensive: if note not found, treat as new
        this.newlyCreatedNote = true;
        this.notes_id = uuidv4();
        return;
      }

      if (this.currentNote.protected) {
        this.note_locked = true;
        this.captureEncryptedProtectedState(this.currentNote);
        this.clearProtectedNoteDraftFields();
        this.askforNotePassword().then(() => {});
      } else {
        this.note_text = this.currentNote.text ?? '';
        this.note_title = this.currentNote.title !== undefined ? this.currentNote.title : this.getUntitledLabel();
      }

      this.startLiveNotePolling();
    });
  }

  private getUntitledLabel(): string {
    return this.allTranslations?.untitled ?? 'Untitled';
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.stopLiveNotePolling();
    this.removeProtectedNoteRelockListeners().then(() => {});
    this.clearProtectedNoteRuntimeState();
    this.mkRaw = null;
  }

  ionViewDidEnter() {
    this.passwordStrengthHelperText = this.allTranslations?.passwordAtLeastLength ?? '';
    this.installProtectedNoteRelockListeners().then(() => {});

    if (this.note_text.length === 0) {
      setTimeout(() => this.placeCursorAtEnd(), 100);
    }
  }

  // Small helper: base64 -> Uint8Array
  private b64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async ionViewWillEnter(): Promise<void> {
    this.allTranslations = this.translatorService.allTranslations;

    // 🔐 Load MK from secure storage (same logic som HomePage)
    try {
      if (!this.notesService.appHasPasswordChallenge()) {
        const eakB64 = await this.secureStorageService.getItem('ssEakB64');
        if (eakB64) {
          this.mkRaw = this.b64ToBytes(eakB64);
        }
      } else {
        const enc = await this.secureStorageService.getItem('ssEakB64_Encrypted');
        const appPass = this.notesService.getNotesAppPassword();
        if (enc && appPass) {
          const decrypted = this.cryptoService.decrypt(enc, appPass) as string;
          this.mkRaw = this.b64ToBytes(decrypted);
        }
      }
    } catch (e) {
    }
  }

  // ✅ Save when leaving the page (covers header back, swipe-back, router navigation, hardware back, etc.)
  ionViewWillLeave() {
    this.forceSaveNow();
    this.relockProtectedNote();
    this.stopLiveNotePolling();
    this.removeProtectedNoteRelockListeners().then(() => {});

    // if (this.richTextEditorComponent?.onLeave) {
    //   this.richTextEditorComponent.onLeave();
    // }
  }

  private placeCursorAtEnd() {
    // const editorElem = this.richTextEditorComponent?.editorComponent?.textArea?.nativeElement;
    // if (!editorElem) return;

    // editorElem.focus();
    // const selection = window.getSelection();
    // const range = document.createRange();
    // const lastChild = editorElem.lastChild;

    // if (selection && range && lastChild) {
    //   range.selectNodeContents(editorElem);
    //   range.collapse(false);
    //   selection.removeAllRanges();
    //   selection.addRange(range);
    // }
  }

  private captureEncryptedProtectedState(note: NoteV1) {
    this.encryptedProtectedText = typeof note.text === 'string' ? note.text : '';
    this.encryptedProtectedTitle = typeof note.title === 'string' ? note.title : '';
  }

  private restoreEncryptedProtectedState() {
    if (!this.currentNote?.protected) {
      return;
    }

    if (this.encryptedProtectedText.length > 0) {
      this.currentNote.text = this.encryptedProtectedText;
    }

    if (this.encryptedProtectedTitle.length > 0 || this.currentNote.title === undefined) {
      this.currentNote.title = this.encryptedProtectedTitle;
    }

    for (let i = 0; i < this.notes.length; i++) {
      if (this.notes[i].id === this.notes_id) {
        this.notes[i].text = this.currentNote.text;
        this.notes[i].title = this.currentNote.title;
        break;
      }
    }
  }

  private clearProtectedNoteDraftFields() {
    this.note_text = '';
    this.note_title = '';
    this.notes_password_input = '';
    this.notes_password_confirm = '';
  }

  private clearProtectedNoteRuntimeState() {
    this.restoreEncryptedProtectedState();
    this.clearProtectedNoteDraftFields();
    this.notes_password_stored = '';
  }

  private relockProtectedNote() {
    if (!this.currentNote?.protected) {
      return;
    }

    if (this.note_locked) {
      this.clearProtectedNoteRuntimeState();
      return;
    }

    this.note_locked = true;
    this.clearProtectedNoteRuntimeState();
  }

  private async installProtectedNoteRelockListeners() {
    if (!this.appStateListener) {
      this.appStateListener = await App.addListener('appStateChange', ({ isActive }: { isActive: boolean }) => {
        if (!isActive) {
          this.relockProtectedNote();
          return;
        }

        this.promptUnlockForProtectedNote().then(() => {});
      });
    }

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler, true);
      document.addEventListener('visibilitychange', this.visibilityChangeHandler, true);
    }
  }

  private async removeProtectedNoteRelockListeners() {
    await this.appStateListener?.remove();
    this.appStateListener = undefined;

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler, true);
    }
  }

  private async promptUnlockForProtectedNote() {
    if (!this.currentNote?.protected || !this.note_locked) {
      return;
    }

    if (this.noteUnlockModalOpen || this.notesService.shouldAskForPassword()) {
      return;
    }

    if (typeof document !== 'undefined' && document.hidden) {
      return;
    }

    await this.askforNotePassword();
  }

  // --- Fix #1: prevent empty “new note” auto-save on leave ---

  private htmlToPlainText(html: string): string {
    if (!html) return '';
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return (doc.body?.textContent ?? '').replace(/\u00A0/g, ' ').trim();
    } catch {
      return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\u00A0/g, ' ')
        .trim();
    }
  }

  private isEffectivelyEmptyNewNote(): boolean {
    if (!this.newlyCreatedNote) return false;

    const title = (this.note_title ?? '').trim();
    const titleEmpty = title.length === 0 || title === this.getUntitledLabel();

    const plainText = this.htmlToPlainText(this.note_text ?? '');
    const textEmpty = plainText.length === 0;

    return titleEmpty && textEmpty;
  }

  // ✅ Flush debounce and save immediately
  private forceSaveNow(): void {
    // Do not save if we are intentionally leaving after deleting (or other flows)
    if (this.suppressAutoSave) return;

    // Fix #1: do not auto-create empty notes when user immediately goes back
    if (this.isEffectivelyEmptyNewNote()) return;

    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }

    this.typing = false;
    this.save(null);
  }

  public async shareStellarSecret() {
    const addSecretModal = new Secret();
    const secret_id = uuidv4();

    addSecretModal.expires_at = '0';
    addSecretModal.id = sha512(secret_id);

    let secretMessage = this.note_text.replace(/<br ?\/?>/g, '\n');
    const doc = new DOMParser().parseFromString(secretMessage, 'text/html');
    secretMessage = doc.body?.textContent?.trim() || '';

    addSecretModal.message = CryptoJS.AES.encrypt(secretMessage, secret_id).toString();

    const modal = await this.modalCtrl.create({
      component: ShareSecretModalComponent,
      componentProps: { addSecretModal, secret_id },
      cssClass: 'secret-modal',
      breakpoints: [0, 0.7],
      initialBreakpoint: 0.7,
    });

    await modal.present();
  }

  enableEditingTitle() {
    this.isEditingTitle = true;
    setTimeout(() => this.titleInputRef?.setFocus(), 100);
  }

  public noteTitleChange(event: any) {
    const newTitle = (event?.detail?.value ?? '').trim();
    this.note_title = newTitle;

    for (let i = 0; i < this.notes.length; i++) {
      if (this.notes[i].id === this.notes_id) {
        this.notes[i].title = this.note_title;
        break;
      }
    }

    this.onSave(newTitle, 'note_title');
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
    }, 10_000);
  }

  pauseLiveSync() {
    this.isPaused = true;
  }

  resumeLiveSync() {
    this.isPaused = false;
    this.fetchLiveNote().then(() => {});
  }

  private stopLiveNotePolling() {
    this.stopSyncing = true;
    if (this.liveNoteTimer) clearInterval(this.liveNoteTimer);
    window.removeEventListener('focus', this.fetchLiveNoteBound);
    window.removeEventListener('online', this.fetchLiveNoteBound);
  }

  private async fetchLiveNote() {
    if (this.stopSyncing) return;
    if (this.note_locked) return;

    if (this.typing) {
      return;
    }
    if (!this.notes_id) return;

    const noteId = this.notes_id as string;

    try {
      if (!this.authService.isLoggedIn) return;

      this.notesApiV1Service
        .find(noteId)
        .then(async (note: any) => {
          if (this.currentNote == null) return;

          if (note.deleted) {
            this.dataService.setForceDownloadOnHome(true);
            await this.navController.navigateForward('/');
            return;
          }

          if (note.protected !== this.currentNote.protected) {
            this.dataService.setForceDownloadOnHome(true);
            await this.navController.navigateForward('/');
            return;
          }

          if (!note.protected) this.notes_password_stored = '';

          if (this.currentNote.last_modified == note.last_modified) {
            return;
          }
          if ((this.currentNote.last_modified ?? 0) > (note.last_modified ?? 0)) {
            return;
          }

          if (!this.mkRaw) {
            return;
          }

          // 🔐 Decrypt text (required)
          const blobText = unpackCipherBlob(note.text);
          note.text = await decryptTextWithMK(this.mkRaw, {
            ...blobText,
            v: 1,
            aad_b64: btoa(noteId),
          });

          // 🔐 Decrypt title if present
          if (typeof note.title === 'string' && note.title.length > 0) {
            const blobTitle = unpackCipherBlob(note.title);
            note.title = await decryptTextWithMK(this.mkRaw, {
              ...blobTitle,
              v: 1,
              aad_b64: btoa(noteId + '#title'),
            });
          } else {
            note.title = '';
          }

          this.currentNote.text = note.text;
          this.note_title = note.title;
          this.note_text = note.text;
          this.currentNote.title = this.note_title;

          if (note.protected) {
            const ok = this.decryptNote(this.notes_password_stored, note);
            if (!ok) {
              this.dismissModal().then(() => {});
              await this.navController.navigateForward('/');
            }
          }
        })
        .catch(() => {
          /* ignore; try again on next tick */
        });
    } catch (err) {
    }
  }

  // should be called on key enter.
  save(ev: any) {
    if (this.notes_id === null) return;
    if (this.note_locked) return;

    const plainText = this.note_text ?? '';
    const plainTitle = this.note_title ?? '';

    const textForEncrypt = plainText.length > 0 ? plainText : ' ';
    const titleForEncrypt = plainTitle;

    let encryptedText = textForEncrypt;
    let encryptedTitle = titleForEncrypt;

    if ((this.notes_password_stored ?? '').length > 1) {
      encryptedText = this.cryptoService.encrypt(textForEncrypt, this.notes_password_stored);
      encryptedTitle = this.cryptoService.encrypt(titleForEncrypt, this.notes_password_stored);
    }

    let protectedNote = false;
    if (this.currentNote !== null) protectedNote = !!this.currentNote.protected;

    const now = new Date();
    const datePart = now.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const timePart = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
    const formattedDate = `${datePart} at ${timePart}`;

    const note: NoteV1 = {
      id: this.notes_id,
      title: encryptedTitle && encryptedTitle.length ? encryptedTitle : formattedDate,
      last_modified: Date.now(),
      text: encryptedText,
      protected: protectedNote,
      auto_wipe: true,
    };

    if (protectedNote) {
      this.encryptedProtectedText = encryptedText;
      this.encryptedProtectedTitle = encryptedTitle && encryptedTitle.length ? encryptedTitle : formattedDate;
    } else {
      this.encryptedProtectedText = '';
      this.encryptedProtectedTitle = '';
    }

    if (this.notes === null) {
      this.notes = [note];
    } else {
      let found = false;
      for (let i = 0; i < this.notes.length; i++) {
        if (this.notes[i].id === this.notes_id) {
          this.notes[i] = note;
          found = true;
          break;
        }
      }
      if (!found) this.notes.push(note);
    }

    this.currentNote = note;
    this.storeNoteInStorage(true).then(() => {});
  }

  async storeNoteInStorage(serverSync = true, forceDownloadOnHome = false) {
    // --- Fix #3: clear previous queued upload timeout to avoid multiple uploads stacking ---
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    if (this.notesService.appHasPasswordChallenge()) {
      const encryptedNotesSave = this.cryptoService.encrypt(
        JSON.stringify(this.notes),
        this.notesService.getNotesAppPassword()
      );
      this.notesService.setNotes(encryptedNotesSave);
    } else {
      this.notesService.setNotes(JSON.stringify(this.notes));
    }

    if (forceDownloadOnHome) {
      this.dataService.setForceDownloadOnHome(true);
    }

    const notesToSend = this.notes;

    this.saveTimeout = window.setTimeout(() => {
      (async () => {
        if (serverSync && this.authService.isLoggedIn) {
          this.notesApiV1Service.upload(0, notesToSend).then(() => {});
          if (this.liveNoteTimer == null) {
            this.startLiveNotePolling();
          }
        }
      })();
    }, 500);
  }

  public back() {
    // Ensure save is executed before leaving via custom back button
    this.forceSaveNow();
    this.navController.back();
  }

  private formatNoteLockoutMessage(remainingMs: number): string {
    const totalSeconds = Math.max(1, Math.ceil(remainingMs / 1000));

    if (totalSeconds >= 60) {
      const minutes = Math.ceil(totalSeconds / 60);
      return `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
    }

    return `Too many failed attempts. Try again in ${totalSeconds} second${totalSeconds === 1 ? '' : 's'}.`;
  }

  private async wrongPasswordEntered(lockoutMs = 0) {
    const toast = await this.toastController.create({
      message: lockoutMs > 0 ? this.formatNoteLockoutMessage(lockoutMs) : this.allTranslations.passwordIsNotCorrectTryAgain,
      duration: 3000,
      position: 'bottom',
    });
    await toast.present();
    await this.askforNotePassword();
  }

  public async askforNotePassword() {
    if (this.noteUnlockModalOpen) {
      return;
    }

    this.noteUnlockModalOpen = true;

    const modal = await this.modalCtrl.create({
      component: NoteLockedModalComponent,
      cssClass: 'confirmation-popup',
    });

    modal.onDidDismiss().then(async (data) => {
      this.noteUnlockModalOpen = false;

      if (data && data.data) {
        const { confirm, inputValue } = data.data || {};
        if (confirm) {
          if (!this.notes_id) {
            return;
          }

          const lockoutRemaining = this.notesService.getNoteUnlockLockoutRemainingMs(this.notes_id);
          if (lockoutRemaining > 0) {
            await this.wrongPasswordEntered(lockoutRemaining);
            return;
          }

          this.notes_password_stored = inputValue ?? '';

          const ok = this.decryptNote(this.notes_password_stored, this.currentNote);
          if (!ok) {
            const lockoutMs = this.notesService.registerFailedNoteUnlockAttempt(this.notes_id);
            this.notes_password_stored = '';
            await this.wrongPasswordEntered(lockoutMs);
          } else {
            this.notesService.clearNoteUnlockFailures(this.notes_id);
          }
        } else {
          this.back();
        }
      }

      if (data?.role === 'backdrop') {
        this.back();
      }
    });

    return await modal.present();
  }

  private decryptNote(notePassword: string, noteToDecrypt: NoteV1 | any): boolean {
    if (!notePassword?.length) return false;

    let decryptedText: string | null = null;

    try {
      decryptedText = this.cryptoService.decrypt(noteToDecrypt.text, notePassword);
    } catch (e) {
      return false;
    }

    if (!decryptedText?.length) return false;

    let decryptedTitle = '';
    try {
      decryptedTitle = this.cryptoService.decrypt(noteToDecrypt.title, notePassword);
    } catch (e) {
      // title may be empty or fail silently
    }

    if (this.currentNote) {
      this.currentNote.text = decryptedText;
      this.currentNote.title = decryptedTitle;
    }

    this.note_text = decryptedText;
    this.note_title = decryptedTitle;
    this.note_locked = false;

    return true;
  }

  public async dismissModal() {
    await this.modal.dismiss();
  }

  public notesPasswordChange() {
    const strength = evaluatePasswordStrength(this.notes_password_input);

    this.passwordStrength = strength.score;
    this.upperLower = strength.upperLower;
    this.specialChar = strength.specialChar;
    this.strongPass = strength.strongPass;
    this.passwordStrengthHelperText =
      this.allTranslations?.[strength.helperKey] ?? '';
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

    if (!isPasswordLongEnough(this.notes_password_input)) {
      const toast = await this.toastController.create({
        message: this.allTranslations.thePasswordIsTooWeakPleaseMakeItStronger,
        duration: 3000,
        position: 'bottom',
      });
      await toast.present();
      return;
    }

    this.notes_password_stored = this.notes_password_input;
    if (this.notes_id) {
      this.notesService.clearNoteUnlockFailures(this.notes_id);
    }

    const decryptedText = this.note_text;
    const decryptedTitle = this.note_title;

    const encryptedText = this.cryptoService.encrypt(this.note_text, this.notes_password_stored);
    const encryptedTitle = this.cryptoService.encrypt(this.note_title, this.notes_password_stored);

    if (this.currentNote) {
      this.currentNote.protected = true;
      this.currentNote.text = encryptedText;
      this.currentNote.title = encryptedTitle;
    }

    const newNotes: NoteV1[] = [];
    for (let i = 0; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.id === this.notes_id) {
        const updated: NoteV1 = {
          ...note,
          ...(this.currentNote as NoteV1),
          last_modified: Date.now(),
        };
        newNotes.push(updated);
      } else {
        newNotes.push(note);
      }
    }
    this.notes = newNotes;

    this.storeNoteInStorage(true);

    if (this.currentNote) {
      this.currentNote.text = decryptedText;
      this.currentNote.title = decryptedTitle;
    }

    this.notes_password_confirm = '';
    this.notes_password_input = '';

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
        },
        {
          text: this.allTranslations.removeLock,
          role: 'confirm',
          handler: () => {
            for (let i = 0; i < this.notes.length; i++) {
              if (this.notes[i].id === this.notes_id) {
                this.notes[i].text = this.note_text;
                this.notes[i].title = this.note_title;
                this.notes[i].last_modified = Date.now();
                this.notes[i].protected = false;
                this.currentNote = this.notes[i];
                this.notes_password_stored = '';
                this.encryptedProtectedText = '';
                this.encryptedProtectedTitle = '';
                if (this.notes_id) {
                  this.notesService.clearNoteUnlockFailures(this.notes_id);
                }
                break;
              }
            }

            if (this.authService.isLoggedIn) {
              this.stopSyncing = true;
              this.notesApiV1Service.upload(0, this.notes);
              this.stopSyncing = false;
            }

            this.storeNoteInStorage(true);
            this.modal.dismiss();
          },
        },
      ],
    });

    await alert.present();
  }

  public async openLockModal() {
    this.save(null);
    await this.modal.present();
  }

  public getProtected() {
    return this.currentNote?.protected;
  }

  public async deleteNote() {
    const modal = await this.modalCtrl.create({
      component: DeleteNoteModalComponent,
      cssClass: 'confirmation-popup',
      componentProps: { isSingleDelete: true },
    });

    modal.onDidDismiss().then(async (data) => {
      if (data && data.data) {
        const { confirm } = data.data;
        if (confirm) {
          // ✅ prevent ionViewWillLeave() from saving the deleted note back
          this.suppressAutoSave = true;

          const deletedId = this.notes_id;

          for (let i = 0; i < this.notes.length; i++) {
            if (this.notes[i].id === this.notes_id) {
              this.notes[i].deleted = true;

              if (this.authService.isLoggedIn) {
                this.notesApiV1Service.deleteNotes([this.notes[i].id]).then(() => {});
              }

              this.notes.splice(i, 1);
              break;
            }
          }

          await this.storeNoteInStorage(true, this.newlyCreatedNote);

          if (deletedId) {
            this.notesService.clearNoteUnlockFailures(deletedId);
          }

          // Extra safety: make sure save() can’t re-add this note
          this.currentNote = null;
          this.notes_id = null;

          await this.navController.navigateForward('/?hide_ids=' + (deletedId ?? ''));
        }
      }
    });

    return await modal.present();
  }

  onSaveOld(event: any, type: string = 'note_text'): void {
    if (type === 'note_text') {
      this.note_text = event;
    } else {
      this.note_title = event;
    }

    this.typing = true;
    this.typingTimeout = setTimeout(() => (this.typing = false), 10_000);

    clearTimeout(this.saveTimeout);
    this.save(null);
  }

  onSave(event: any, type: string = 'note_text'): void {
    if (type === 'note_text') {
      this.note_text = event;
    } else {
      this.note_title = event;
    }

    this.typing = true;

    // cancel previous save
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    // save only after pause
    this.saveDebounceTimer = setTimeout(() => {
      this.typing = false;
      this.save(null);
    }, 800); // sweet spot (500–1000ms)
  }
}
