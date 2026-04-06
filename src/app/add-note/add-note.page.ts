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
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
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
import { Folder } from '../models/Folder';
import { AuthService } from '../services/auth.service';
import { AppHapticsService } from '../services/app-haptics.service';
import { evaluatePasswordStrength, getWeakPasswordEducationKeys, isPasswordAcceptable, shouldConfirmWeakPassword } from '../utils/password-policy';
import { unpackCipherBlob, decryptTextWithMK } from '@stellarsecurity/stellar-crypto';
declare var require: any;
const { v4: uuidv4 } = require('uuid');
const CryptoJS = require('crypto-js');

@Component({
  selector: 'app-add-note',
  templateUrl: './add-note.page.html',
  styleUrls: ['./add-note.page.scss'],
})
export class AddNotePage implements OnDestroy {
  @ViewChild('lockModal') lockModal!: IonModal;
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
  public weakPasswordWarningVisible = false;
  public weakPasswordEducationKeys: string[] = [];
  public note_text = '';
  public note_title = '';
  public allTranslations: any;
  public isEditingTitle = false;
  public folders: Folder[] = [];
  public moreMenuOpen = false;
  public moreMenuEvent?: Event;
  public folderPickerOpen = false;
  public folderPickerSelection = '__all__';
  public newFolderModalOpen = false;
  public newFolderName = '';
  public imagePreviewOpen = false;
  public imagePreviewSrc = '';

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
  private suppressAutoSave = false;
  private pendingDeletedNote: NoteV1 | null = null;
  private pendingNewFolderResolver: ((value: string | null) => void) | null = null;

  private initialNoteSnapshot: {
    title: string;
    text: string;
    favorite: boolean;
    pinned: boolean;
    protected: boolean;
    folder: string;
  } | null = null;

  private lastSavedSnapshot: {
    title: string;
    text: string;
    favorite: boolean;
    pinned: boolean;
    protected: boolean;
    folder: string;
  } | null = null;

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
    private authService: AuthService,
    private appHaptics: AppHapticsService,
  ) {
    this.routeSub = this.activatedRoute.paramMap.subscribe((params: ParamMap) => {
      const decrypted = this.notesService.getDecryptedNotes();

      try {
        this.notes = decrypted ? (JSON.parse(decrypted) as NoteV1[]) : [];
      } catch (error) {
        this.notes = [];
      }
      this.notes = (this.notes ?? []).map((note: NoteV1) => ({
        ...note,
        folder: (note?.folder ?? '').trim(),
        folder_id: this.normalizeFolderId((note as any)?.folder_id),
        favorite: !!note?.favorite,
        pinned: !!note?.pinned,
      }));

      this.notes_id = params.get('id');
      this.currentNote = null;
      this.initialNoteSnapshot = null;
      this.lastSavedSnapshot = null;

      if (this.notes_id === null) {
        this.newlyCreatedNote = true;
        this.notes_id = uuidv4();
        this.note_text = '';
        this.note_title = '';
        this.currentNote = this.createDraftNote(this.getInitialFolderFromRoute());
        this.captureInitialSnapshot();
        return;
      }

      this.currentNote = this.notesService.findNoteById(this.notes_id, this.notes) as NoteV1 | null;

      if (!this.currentNote) {
        this.newlyCreatedNote = true;
        this.notes_id = uuidv4();
        this.note_text = '';
        this.note_title = '';
        this.currentNote = this.createDraftNote(this.getInitialFolderFromRoute());
        this.captureInitialSnapshot();
        return;
      }

      this.currentNote.favorite = !!this.currentNote.favorite;
      this.currentNote.pinned = !!this.currentNote.pinned;
      this.currentNote.folder = (this.currentNote.folder ?? '').trim();
      this.currentNote.folder_id = this.normalizeFolderId(this.currentNote.folder_id);

      if (this.currentNote.protected) {
        this.note_locked = true;
        this.captureEncryptedProtectedState(this.currentNote);
        this.clearProtectedNoteDraftFields();
        this.askforNotePassword().then(() => {});
      } else {
        this.note_text = this.currentNote.text ?? '';
        this.note_title = this.currentNote.title !== undefined ? this.currentNote.title : this.getUntitledLabel();
        this.captureInitialSnapshot();
      }

      this.startLiveNotePolling();
    });
  }

  private getUntitledLabel(): string {
    return this.allTranslations?.untitled ?? 'Untitled';
  }

  private getInitialFolderFromRoute(): string {
    const rawFolder = (this.activatedRoute.snapshot.queryParamMap.get('folder') ?? '').trim();

    if (!rawFolder || rawFolder === '__all__') {
      return '';
    }

    return rawFolder;
  }

  private createDraftNote(folder = ''): NoteV1 {
    const folderEntry = this.findFolderByName(folder);
    return {
      id: this.notes_id as string,
      text: this.note_text ?? '',
      title: this.note_title ?? '',
      protected: false,
      favorite: false,
      pinned: false,
      folder,
      folder_id: folderEntry?.id ?? null,
      last_modified: Date.now(),
      auto_wipe: true,
    };
  }

  private createCurrentSnapshot() {
    return {
      title: this.note_title ?? '',
      text: this.note_text ?? '',
      favorite: !!this.currentNote?.favorite,
      pinned: !!this.currentNote?.pinned,
      protected: !!this.currentNote?.protected,
      folder: this.currentNote?.folder ?? '',
    };
  }

  private snapshotsEqual(
    a: {
      title: string;
      text: string;
      favorite: boolean;
      pinned: boolean;
      protected: boolean;
      folder: string;
    } | null,
    b: {
      title: string;
      text: string;
      favorite: boolean;
      pinned: boolean;
      protected: boolean;
      folder: string;
    } | null,
  ): boolean {
    if (!a || !b) return false;

    return a.title === b.title
      && a.text === b.text
      && a.favorite === b.favorite
      && a.pinned === b.pinned
      && a.protected === b.protected
      && a.folder === b.folder;
  }

  private captureInitialSnapshot() {
    const snapshot = this.createCurrentSnapshot();
    this.initialNoteSnapshot = { ...snapshot };
    this.lastSavedSnapshot = { ...snapshot };
  }

  private markSnapshotSaved() {
    this.lastSavedSnapshot = { ...this.createCurrentSnapshot() };

    if (!this.initialNoteSnapshot) {
      this.initialNoteSnapshot = { ...this.lastSavedSnapshot };
    }
  }

  private hasMeaningfulChanges(): boolean {
    const current = this.createCurrentSnapshot();

    if (this.lastSavedSnapshot && !this.snapshotsEqual(current, this.lastSavedSnapshot)) {
      return true;
    }

    if (this.initialNoteSnapshot && !this.snapshotsEqual(current, this.initialNoteSnapshot)) {
      return true;
    }

    return false;
  }

  public isFavorite(): boolean {
    return !!this.currentNote?.favorite;
  }

  public isPinned(): boolean {
    return !!this.currentNote?.pinned;
  }

  public currentFolderLabel(): string {
    return (this.currentNote?.folder ?? '').trim() || this.allTranslations?.allNotes || 'All';
  }

  public toggleMoreMenu(event?: Event): void {
    event?.stopPropagation();

    if (this.moreMenuOpen) {
      this.closeMoreMenu();
      return;
    }

    this.moreMenuEvent = event;
    this.moreMenuOpen = true;
  }

  public closeMoreMenu(): void {
    this.moreMenuOpen = false;
    this.moreMenuEvent = undefined;
  }

  public async handleTogglePinned(): Promise<void> {
    this.closeMoreMenu();
    await this.togglePinned();
  }

  public async handleToggleFavorite(): Promise<void> {
    this.closeMoreMenu();
    await this.toggleFavorite();
  }

  public async handleShare(): Promise<void> {
    this.closeMoreMenu();
    await this.shareStellarSecret();
  }

  public async handleDelete(): Promise<void> {
    this.closeMoreMenu();
    await this.deleteNote();
  }


  public openImagePreview(imageSrc: string): void {
    if (!imageSrc) {
      return;
    }

    this.imagePreviewSrc = imageSrc;
    this.imagePreviewOpen = true;
  }

  public closeImagePreview(): void {
    this.imagePreviewOpen = false;
    this.imagePreviewSrc = '';
  }

  private getImageFileExtension(imageSrc: string): string {
    const match = /^data:image\/([a-zA-Z0-9.+-]+);base64,/.exec(imageSrc || '');
    const type = (match?.[1] ?? 'png').toLowerCase();

    if (type === 'jpeg') {
      return 'jpg';
    }

    if (type === 'svg+xml') {
      return 'svg';
    }

    return type;
  }

  private getImageBase64Payload(imageSrc: string): string | null {
    const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/s.exec(imageSrc || '');
    return match?.[1] ?? null;
  }

  private async downloadImageOnWeb(imageSrc: string, fileName: string): Promise<void> {
    const anchor = document.createElement('a');
    anchor.href = imageSrc;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  private async writeImageToLocalFile(imageSrc: string): Promise<{ uri: string; fileName: string }> {
    const base64Payload = this.getImageBase64Payload(imageSrc);
    if (!base64Payload) {
      throw new Error('Unsupported image format');
    }

    const extension = this.getImageFileExtension(imageSrc);
    const fileName = `stellar-note-image-${Date.now()}.${extension}`;
    const result = await Filesystem.writeFile({
      path: fileName,
      data: base64Payload,
      directory: Directory.Documents,
      recursive: true,
    });

    return {
      uri: result.uri,
      fileName,
    };
  }

  public async savePreviewImage(): Promise<void> {
    if (!this.imagePreviewSrc) {
      return;
    }

    try {
      const fileName = `stellar-note-image-${Date.now()}.${this.getImageFileExtension(this.imagePreviewSrc)}`;

      if (Capacitor.getPlatform() === 'web') {
        await this.downloadImageOnWeb(this.imagePreviewSrc, fileName);
      } else {
        await this.writeImageToLocalFile(this.imagePreviewSrc);
      }

      const toast = await this.toastController.create({
        message: this.allTranslations?.saveImageSuccess ?? 'Image saved',
        duration: 2200,
        position: 'bottom',
      });
      await toast.present();
    } catch {
      const toast = await this.toastController.create({
        message: this.allTranslations?.saveImageFailed ?? 'Unable to save image',
        duration: 2400,
        position: 'bottom',
      });
      await toast.present();
    }
  }

  public async sharePreviewImage(): Promise<void> {
    if (!this.imagePreviewSrc) {
      return;
    }

    try {
      if (Capacitor.getPlatform() === 'web') {
        await Share.share({
          title: this.note_title || this.getUntitledLabel(),
          text: this.allTranslations?.shareImage ?? 'Share image',
          url: this.imagePreviewSrc,
          dialogTitle: this.allTranslations?.shareImage ?? 'Share image',
        });
      } else {
        const file = await this.writeImageToLocalFile(this.imagePreviewSrc);
        await Share.share({
          title: this.note_title || this.getUntitledLabel(),
          text: this.allTranslations?.shareImage ?? 'Share image',
          url: file.uri,
          dialogTitle: this.allTranslations?.shareImage ?? 'Share image',
        });
      }
    } catch {
    }
  }

  private normalizeFolderId(folderId: any): string | null {
    return typeof folderId === 'string' && folderId.trim().length > 0 ? folderId.trim() : null;
  }

  private findFolderByName(name: string): Folder | undefined {
    const normalizedName = (name ?? '').trim().toLowerCase();
    if (!normalizedName) {
      return undefined;
    }

    return this.folders.find((folder) => !folder?.deleted && (folder.name ?? '').trim().toLowerCase() === normalizedName);
  }

  private getStoredFolders(): Folder[] {
    try {
      const rawFolders = this.notesService.getFolders();
      const decodedFolders = this.notesService.appHasPasswordChallenge()
        ? this.cryptoService.decrypt(rawFolders, this.notesService.getNotesAppPassword())
        : rawFolders;
      const parsedFolders = decodedFolders ? JSON.parse(decodedFolders) : [];

      if (!Array.isArray(parsedFolders)) {
        return [];
      }

      return parsedFolders
        .map((folder: any) => ({
          id: this.normalizeFolderId(folder?.id) ?? uuidv4(),
          name: (folder?.name ?? '').trim(),
          last_modified: Number(folder?.last_modified ?? Date.now()),
          deleted: !!folder?.deleted,
        }))
        .filter((folder: Folder) => folder.name.length > 0 || folder.deleted);
    } catch {
      return [];
    }
  }

  private async uploadFoldersState(): Promise<void> {
    if (!this.authService.isLoggedIn) {
      return;
    }

    void this.notesApiV1Service.upload(0, [], undefined, this.getStoredFolders()).then(() => {});
  }

  private loadFolders(): void {
    try {
      const storedFolders = this.getStoredFolders();
      const folderMap = new Map<string, Folder>();
      for (const folder of storedFolders ?? []) {
        if (folder.deleted) continue;
        const name = (folder?.name ?? '').trim();
        if (!name) continue;
        folderMap.set(name.toLowerCase(), {
          id: folder.id,
          name,
          last_modified: folder?.last_modified ?? Date.now(),
          deleted: false,
        });
      }
      for (const note of this.notes ?? []) {
        const name = (note?.folder ?? '').trim();
        if (!name || folderMap.has(name.toLowerCase())) continue;
        folderMap.set(name.toLowerCase(), {
          id: this.normalizeFolderId((note as any)?.folder_id) ?? uuidv4(),
          name,
          last_modified: note?.last_modified ?? Date.now(),
          deleted: false,
        });
      }
      this.folders = Array.from(folderMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      this.folders = [];
    }
  }

  private async persistFoldersState(): Promise<void> {
    const storedMap = new Map<string, Folder>();
    for (const folder of this.getStoredFolders()) {
      const key = this.normalizeFolderId(folder.id) ?? `name:${(folder.name ?? '').trim().toLowerCase()}`;
      storedMap.set(key, folder);
    }

    for (const folder of this.folders) {
      const normalizedName = (folder?.name ?? '').trim();
      if (!normalizedName) continue;
      const normalizedFolder: Folder = {
        id: this.normalizeFolderId(folder.id) ?? uuidv4(),
        name: normalizedName,
        last_modified: Number(folder?.last_modified ?? Date.now()),
        deleted: !!folder?.deleted,
      };
      storedMap.set(normalizedFolder.id as string, normalizedFolder);
    }

    const rawFolders = JSON.stringify(Array.from(storedMap.values()));
    if (this.notesService.appHasPasswordChallenge()) {
      const encryptedFolders = this.cryptoService.encrypt(rawFolders, this.notesService.getNotesAppPassword());
      this.notesService.setFolders(encryptedFolders);
    } else {
      this.notesService.setFolders(rawFolders);
    }
    await this.notesService.flushPersistence();
    void this.uploadFoldersState();
  }

  private upsertFolder(name: string): string {
    const normalizedName = (name ?? '').trim();
    if (!normalizedName) {
      return '';
    }
    const existing = this.folders.find((folder) => (folder.name ?? '').toLowerCase() === normalizedName.toLowerCase());
    if (existing) {
      if (!existing.id) {
        existing.id = uuidv4();
      }
      existing.deleted = false;
      existing.last_modified = Date.now();
      return existing.name;
    }
    this.folders = [...this.folders, { id: uuidv4(), name: normalizedName, last_modified: Date.now(), deleted: false }]
      .sort((a, b) => a.name.localeCompare(b.name));
    return normalizedName;
  }

  private resolveFolderIdByName(name: string): string | null {
    return this.findFolderByName(name)?.id ?? null;
  }

  private blurFocusedElement(): void {
    const activeElement = document.activeElement as HTMLElement | null;
    if (activeElement?.blur) {
      activeElement.blur();
    }
  }

  private async waitForOverlayTransition(duration = 260): Promise<void> {
    await new Promise((resolve) => window.setTimeout(resolve, duration));
  }

  private async promptForNewFolderName(): Promise<string | null> {
    this.newFolderName = '';
    this.blurFocusedElement();
    await this.waitForOverlayTransition(40);
    this.newFolderModalOpen = true;

    return new Promise((resolve) => {
      this.pendingNewFolderResolver = resolve;
    });
  }

  public closeNewFolderModalFromDismiss(): void {
    if (!this.newFolderModalOpen) {
      return;
    }
    this.cancelNewFolderModal();
  }

  public cancelNewFolderModal(): void {
    this.newFolderModalOpen = false;
    this.newFolderName = '';
    this.pendingNewFolderResolver?.(null);
    this.pendingNewFolderResolver = null;
  }

  public async confirmNewFolderModal(): Promise<void> {
    const folderName = this.upsertFolder(this.newFolderName ?? '');
    if (!folderName) {
      return;
    }

    await this.persistFoldersState();
    this.newFolderModalOpen = false;
    this.newFolderName = '';
    this.pendingNewFolderResolver?.(folderName);
    this.pendingNewFolderResolver = null;
  }

  public async chooseFolder(): Promise<void> {
    this.closeMoreMenu();
    await this.appHaptics.tap();
    this.folderPickerSelection = (this.currentNote?.folder ?? '').trim() || '__all__';
    this.folderPickerOpen = true;
  }

  public closeFolderPicker(): void {
    this.folderPickerOpen = false;
  }

  public async confirmFolderPickerMove(): Promise<void> {
    const folderName = this.folderPickerSelection === '__all__'
      ? ''
      : this.upsertFolder(this.folderPickerSelection ?? '');
    const movedToLabel = folderName || this.allTranslations?.allNotes || 'All';

    if (!this.currentNote && this.notes_id) {
      this.currentNote = {
        id: this.notes_id,
        text: this.note_text ?? '',
        title: this.note_title ?? '',
        protected: false,
        favorite: false,
        pinned: false,
        folder: folderName,
        folder_id: this.resolveFolderIdByName(folderName),
        last_modified: Date.now(),
        auto_wipe: true
      };
    }

    if (this.currentNote) {
      this.currentNote.folder = folderName;
      this.currentNote.folder_id = this.resolveFolderIdByName(folderName);
      this.currentNote.last_modified = Date.now();
    }

    for (let i = 0; i < this.notes.length; i++) {
      if (this.notes[i].id === this.notes_id) {
        this.notes[i].folder = folderName;
        this.notes[i].folder_id = this.resolveFolderIdByName(folderName);
        this.notes[i].last_modified = Date.now();
        break;
      }
    }

    await this.persistFoldersState();
    this.folderPickerOpen = false;
    this.save(null);

    const moveMessageTemplate = this.allTranslations?.noteMovedToFolder ?? 'Note moved to {{folderName}}';
    const moveMessage = moveMessageTemplate.replace('{{folderName}}', movedToLabel);
    const toast = await this.toastController.create({
      message: moveMessage,
      duration: 2200,
      position: 'bottom',
    });
    await toast.present();
  }

  public async createFolderFromPicker(): Promise<void> {
    await this.appHaptics.tap();
    this.blurFocusedElement();
    this.folderPickerOpen = false;
    await this.waitForOverlayTransition();

    const folderName = await this.promptForNewFolderName();

    if (!folderName) {
      this.folderPickerOpen = true;
      return;
    }

    this.folderPickerSelection = folderName;
    await this.confirmFolderPickerMove();
  }


  public async toggleFavorite() {
    if (!this.notes_id) {
      return;
    }

    await this.appHaptics.selectionChanged();

    const nextFavorite = !this.currentNote?.favorite;
    const now = Date.now();

    if (!this.currentNote) {
      this.currentNote = {
        id: this.notes_id,
        text: this.note_text ?? '',
        title: this.note_title ?? '',
        protected: false,
        favorite: nextFavorite,
        pinned: false,
        folder: '',
        folder_id: null,
        last_modified: now,
        auto_wipe: true,
      };
    } else {
      this.currentNote.favorite = nextFavorite;
      this.currentNote.last_modified = now;
    }

    let found = false;
    for (let i = 0; i < this.notes.length; i++) {
      if (this.notes[i].id === this.notes_id) {
        this.notes[i].favorite = nextFavorite;
        this.notes[i].last_modified = now;
        found = true;
        break;
      }
    }

    if (!found && this.currentNote) {
      this.notes.push({
        ...this.currentNote,
        favorite: nextFavorite,
      });
    }

    this.notesService.markPendingMutation(this.notes_id, 'favorite', now);
    await this.storeNoteInStorage(true);
  }

  public async togglePinned() {
    if (!this.notes_id) {
      return;
    }

    await this.appHaptics.selectionChanged();

    const nextPinned = !this.currentNote?.pinned;
    const now = Date.now();

    if (!this.currentNote) {
      this.currentNote = {
        id: this.notes_id,
        text: this.note_text ?? '',
        title: this.note_title ?? '',
        protected: false,
        favorite: false,
        pinned: nextPinned,
        folder: '',
        folder_id: null,
        last_modified: now,
        auto_wipe: true,
      };
    } else {
      this.currentNote.pinned = nextPinned;
      this.currentNote.last_modified = now;
    }

    let found = false;
    for (let i = 0; i < this.notes.length; i++) {
      if (this.notes[i].id === this.notes_id) {
        this.notes[i].pinned = nextPinned;
        this.notes[i].last_modified = now;
        found = true;
        break;
      }
    }

    if (!found && this.currentNote) {
      this.notes.push({
        ...this.currentNote,
        pinned: nextPinned,
      });
    }

    this.notesService.markPendingMutation(this.notes_id, 'pin', now);
    await this.storeNoteInStorage(true);
  }

  ngOnDestroy(): void {
    this.closeMoreMenu();
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

  private b64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async ionViewWillEnter(): Promise<void> {
    this.allTranslations = this.translatorService.allTranslations;
    this.loadFolders();

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

  ionViewWillLeave() {
    this.closeMoreMenu();
    this.closeImagePreview();
    this.forceSaveNow();
    this.relockProtectedNote();
    this.stopLiveNotePolling();
    this.removeProtectedNoteRelockListeners().then(() => {});
  }

  private placeCursorAtEnd() {
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

  private forceSaveNow(): void {
    if (this.suppressAutoSave) return;
    if (this.isEffectivelyEmptyNewNote()) return;
    if (!this.hasMeaningfulChanges()) return;

    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }

    this.typing = false;
    this.save(null);
  }

  private async persistLocalNotesState() {
    const rawNotes = JSON.stringify(this.notes);

    if (this.notesService.appHasPasswordChallenge()) {
      const encryptedNotesSave = this.cryptoService.encrypt(
        rawNotes,
        this.notesService.getNotesAppPassword()
      );
      this.notesService.setNotes(encryptedNotesSave);
    } else {
      this.notesService.setNotes(rawNotes);
    }

    this.notesService.setDecryptedNotes(rawNotes);
    await this.notesService.flushPersistence();
  }

  private async restoreDeletedSingleNote() {
    if (!this.pendingDeletedNote) {
      return;
    }

    const restoredNote = { ...this.pendingDeletedNote };
    this.pendingDeletedNote = null;

    this.notesService.clearPendingMutation(restoredNote.id);

    const exists = this.notes.some((note) => note.id === restoredNote.id);
    if (!exists) {
      this.notes.push(restoredNote);
    }

    this.currentNote = restoredNote;
    this.notes_id = restoredNote.id;
    this.suppressAutoSave = false;

    const titleToShow = restoredNote.title !== undefined ? restoredNote.title : this.getUntitledLabel();

    if (restoredNote.protected) {
      this.note_locked = true;
      this.captureEncryptedProtectedState(restoredNote);
      this.clearProtectedNoteDraftFields();
    } else {
      this.note_locked = false;
      this.note_text = restoredNote.text ?? '';
      this.note_title = titleToShow;
      this.captureInitialSnapshot();
    }

    await this.persistLocalNotesState();
    await this.navController.navigateForward('/note/' + restoredNote.id);
  }

  private async commitDeletedSingleNote(noteId: string) {
    this.pendingDeletedNote = null;

    if (noteId) {
      this.notesService.clearNoteUnlockFailures(noteId);
    }

    if (this.authService.isLoggedIn && noteId) {
      this.notesApiV1Service.deleteNotes([noteId]).then(() => {});
    }
  }

  public async shareStellarSecret() {
    await this.appHaptics.tap();

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
    this.appHaptics.selectionChanged();
    this.closeMoreMenu();
    this.isEditingTitle = true;
    setTimeout(() => this.titleInputRef?.setFocus(), 60);
  }

  onTitleBlur() {
    this.isEditingTitle = false;
  }

  onTitleSubmit() {
    this.isEditingTitle = false;
    this.titleInputRef?.getInputElement().then((input) => input.blur()).catch(() => {});
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
    this.appHaptics.selectionChanged();
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility() {
    this.appHaptics.selectionChanged();
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
    if (this.typing) return;
    if (!this.notes_id) return;

    const noteId = this.notes_id as string;

    try {
      if (!this.authService.isLoggedIn) return;

      this.notesApiV1Service
        .find(noteId)
        .then(async (note: any) => {
          if (this.currentNote == null) return;

          if (this.notesService.shouldIgnoreServerNote(note)) {
            return;
          }

          if (note.deleted) {
            this.notesService.reconcileServerConfirmation(note);
            this.dataService.setForceDownloadOnHome(true);
            await this.navController.navigateForward('/');
            return;
          }

          if (note.protected !== this.currentNote.protected) {
            if ((note.last_modified ?? 0) >= (this.currentNote.last_modified ?? 0)) {
              this.dataService.setForceDownloadOnHome(true);
              await this.navController.navigateForward('/');
            }
            return;
          }

          if (!note.protected) {
            this.notes_password_stored = '';
          }

          if (this.currentNote.last_modified == note.last_modified) {
            this.notesService.reconcileServerConfirmation(note);
            return;
          }

          if ((this.currentNote.last_modified ?? 0) > (note.last_modified ?? 0)) {
            return;
          }

          if (!this.mkRaw) {
            return;
          }

          const blobText = unpackCipherBlob(note.text);
          note.text = await decryptTextWithMK(this.mkRaw, {
            ...blobText,
            v: 1,
            aad_b64: btoa(noteId),
          });

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
          this.currentNote.favorite = !!note.favorite;
          this.currentNote.pinned = !!note.pinned;
          this.currentNote.last_modified = note.last_modified;
          this.currentNote.title = note.title;
          this.currentNote.folder = (note.folder ?? '').trim();
          this.currentNote.folder_id = this.normalizeFolderId((note as any).folder_id);

          this.note_title = note.title;
          this.note_text = note.text;

          for (let i = 0; i < this.notes.length; i++) {
            if (this.notes[i].id === noteId) {
              this.notes[i] = {
                ...this.notes[i],
                ...note,
                favorite: !!note.favorite,
                pinned: !!note.pinned,
                folder: (note.folder ?? '').trim(),
                folder_id: this.normalizeFolderId((note as any).folder_id),
              };
              break;
            }
          }

          this.notesService.reconcileServerConfirmation(note);

          if (note.protected) {
            const ok = this.decryptNote(this.notes_password_stored, note);
            if (!ok) {
              this.dismissModal().then(() => {});
              await this.navController.navigateForward('/');
              return;
            }
          } else {
            this.captureInitialSnapshot();
          }
        })
        .catch(() => {
        });
    } catch (err) {
    }
  }

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
    let favoriteNote = false;
    let pinnedNote = false;

    if (this.currentNote !== null) {
      protectedNote = !!this.currentNote.protected;
      favoriteNote = !!this.currentNote.favorite;
      pinnedNote = !!this.currentNote.pinned;
    }

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
      favorite: favoriteNote,
      pinned: pinnedNote,
      folder: this.currentNote?.folder ?? '',
      folder_id: this.normalizeFolderId(this.currentNote?.folder_id),
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
    this.notesService.markPendingMutation(note.id, 'update', note.last_modified);
    void this.storeNoteInStorage(true);
  }

  async storeNoteInStorage(serverSync = true, forceDownloadOnHome = false) {
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

    this.notesService.setDecryptedNotes(JSON.stringify(this.notes));
    await this.notesService.flushPersistence();
    this.markSnapshotSaved();

    if (forceDownloadOnHome) {
      this.dataService.setForceDownloadOnHome(true);
    }

    const notesToSend = this.notes;
    const foldersToSend = this.getStoredFolders();

    this.saveTimeout = window.setTimeout(() => {
      (async () => {
        if (serverSync && this.authService.isLoggedIn) {
          this.notesApiV1Service.upload(0, notesToSend, undefined, foldersToSend).then(() => {});
          if (this.liveNoteTimer == null) {
            this.startLiveNotePolling();
          }
        }
      })();
    }, 500);
  }

  public back() {
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
    await this.appHaptics.error();
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
            this.captureInitialSnapshot();
            await this.appHaptics.success();
          }
        } else {
          await this.appHaptics.tap();
          this.back();
        }
      }

      if (data?.role === 'backdrop') {
        await this.appHaptics.tap();
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
    }

    if (this.currentNote) {
      this.currentNote.text = decryptedText;
      this.currentNote.title = decryptedTitle;
      this.currentNote.favorite = !!noteToDecrypt.favorite;
      this.currentNote.pinned = !!noteToDecrypt.pinned;
    }

    this.note_text = decryptedText;
    this.note_title = decryptedTitle;
    this.note_locked = false;
    return true;
  }

  public async dismissModal() {
    await this.appHaptics.tap();
    await this.lockModal.dismiss();
  }

  private async confirmWeakPasswordUsage(): Promise<boolean> {
    const alert = await this.alertCtrl.create({
      header: this.allTranslations?.warning ?? 'Warning',
      message: this.allTranslations?.weakPasswordConfirmMessage ?? 'This password is weak and may be easier to guess. Do you want to continue anyway?',
      buttons: [
        {
          text: this.allTranslations?.cancel ?? 'Cancel',
          role: 'cancel',
          handler: () => {
            this.appHaptics.tap();
          },
        },
        {
          text: this.allTranslations?.useAnyway ?? 'Use anyway',
          role: 'confirm',
          handler: () => {
            this.appHaptics.warning();
          },
        },
      ],
    });

    await alert.present();
    const result = await alert.onDidDismiss();
    return result.role === 'confirm';
  }

  public notesPasswordChange() {
    const strength = evaluatePasswordStrength(this.notes_password_input);
    this.passwordStrength = strength.score;
    this.upperLower = strength.upperLower;
    this.specialChar = strength.specialChar;
    this.strongPass = strength.strongPass;
    this.weakPasswordWarningVisible = shouldConfirmWeakPassword(this.notes_password_input);
    this.weakPasswordEducationKeys = this.weakPasswordWarningVisible
      ? getWeakPasswordEducationKeys(this.notes_password_input)
      : [];
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
      await this.appHaptics.warning();
      await toast.present();
      return;
    }

    if (!isPasswordAcceptable(this.notes_password_input)) {
      const toast = await this.toastController.create({
        message: this.allTranslations.thePasswordIsTooWeakPleaseMakeItStronger,
        duration: 3000,
        position: 'bottom',
      });
      await this.appHaptics.warning();
      await toast.present();
      return;
    }

    if (shouldConfirmWeakPassword(this.notes_password_input)) {
      const confirmed = await this.confirmWeakPasswordUsage();
      if (!confirmed) {
        return;
      }
    }

    this.notes_password_stored = this.notes_password_input;

    if (this.notes_id) {
      this.notesService.clearNoteUnlockFailures(this.notes_id);
    }

    const decryptedText = this.note_text;
    const decryptedTitle = this.note_title;
    const favorite = !!this.currentNote?.favorite;
    const pinned = !!this.currentNote?.pinned;

    const encryptedText = this.cryptoService.encrypt(this.note_text, this.notes_password_stored);
    const encryptedTitle = this.cryptoService.encrypt(this.note_title, this.notes_password_stored);

    if (this.currentNote) {
      this.currentNote.protected = true;
      this.currentNote.text = encryptedText;
      this.currentNote.title = encryptedTitle;
      this.currentNote.favorite = favorite;
      this.currentNote.pinned = pinned;
      this.currentNote.last_modified = Date.now();
    }

    const newNotes: NoteV1[] = [];
    for (let i = 0; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.id === this.notes_id) {
        const updated: NoteV1 = {
          ...note,
          ...(this.currentNote as NoteV1),
          favorite,
          pinned,
          last_modified: Date.now(),
        };
        newNotes.push(updated);
      } else {
        newNotes.push(note);
      }
    }

    this.notes = newNotes;

    if (this.currentNote?.id) {
      this.notesService.markPendingMutation(
        this.currentNote.id,
        'protect',
        this.currentNote.last_modified ?? Date.now()
      );
    }

    await this.storeNoteInStorage(true);

    if (this.currentNote) {
      this.currentNote.text = decryptedText;
      this.currentNote.title = decryptedTitle;
      this.currentNote.favorite = favorite;
      this.currentNote.pinned = pinned;
    }

    this.note_text = decryptedText;
    this.note_title = decryptedTitle;
    this.captureInitialSnapshot();

    this.notes_password_confirm = '';
    this.notes_password_input = '';

    await this.dismissModal();
    await this.appHaptics.success();
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
            this.appHaptics.tap();
          },
        },
        {
          text: this.allTranslations.removeLock,
          role: 'confirm',
          handler: async () => {
            await this.appHaptics.success();

            for (let i = 0; i < this.notes.length; i++) {
              if (this.notes[i].id === this.notes_id) {
                this.notes[i].text = this.note_text;
                this.notes[i].title = this.note_title;
                this.notes[i].last_modified = Date.now();
                this.notes[i].protected = false;
                this.notes[i].favorite = !!this.notes[i].favorite;
                this.notes[i].pinned = !!this.notes[i].pinned;
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

            if (this.currentNote?.id) {
              this.notesService.markPendingMutation(
                this.currentNote.id,
                'unprotect',
                this.currentNote.last_modified ?? Date.now()
              );
            }

            if (this.authService.isLoggedIn) {
              this.stopSyncing = true;
              this.notesApiV1Service.upload(0, this.notes);
              this.stopSyncing = false;
            }

            await this.storeNoteInStorage(true);
            this.captureInitialSnapshot();
            this.lockModal.dismiss();
          },
        },
      ],
    });

    await alert.present();
  }

  public async openLockModal() {
    this.closeMoreMenu();
    this.save(null);
    await this.lockModal.present();
  }

  public getProtected() {
    return this.currentNote?.protected;
  }

  public async deleteNote() {
    this.closeMoreMenu();
    await this.appHaptics.warning();

    const modal = await this.modalCtrl.create({
      component: DeleteNoteModalComponent,
      cssClass: 'confirmation-popup',
      componentProps: { isSingleDelete: true },
    });

    modal.onDidDismiss().then(async (data) => {
      if (data && data.data) {
        const { confirm } = data.data;
        if (confirm) {
          await this.appHaptics.impactMedium();
          this.suppressAutoSave = true;

          const deletedId = this.notes_id;
          let deletedNote: NoteV1 | null = null;

          for (let i = 0; i < this.notes.length; i++) {
            if (this.notes[i].id === this.notes_id) {
              deletedNote = { ...this.notes[i] };
              this.notes.splice(i, 1);
              break;
            }
          }

          if (!deletedId || !deletedNote) {
            return;
          }

          this.pendingDeletedNote = deletedNote;
          this.notesService.markPendingMutation(deletedId, 'delete', Date.now());

          await this.persistLocalNotesState();

          this.currentNote = null;
          this.notes_id = null;

          await this.navController.navigateForward('/?hide_ids=' + deletedId);

          const toast = await this.toastController.create({
            message: this.allTranslations?.noteDeleted ?? 'Note deleted',
            duration: 4000,
            position: 'bottom',
            buttons: [
              {
                text: this.allTranslations?.undo ?? 'Undo',
                role: 'cancel',
                handler: () => {
                  this.appHaptics.tap();
                  this.restoreDeletedSingleNote().then(() => {});
                },
              },
            ],
          });

          toast.onDidDismiss().then(async (result) => {
            if (result.role === 'cancel') {
              return;
            }
            await this.commitDeletedSingleNote(deletedId);
          });

          await toast.present();
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

    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(() => {
      this.typing = false;
      this.save(null);
    }, 800);
  }
}
