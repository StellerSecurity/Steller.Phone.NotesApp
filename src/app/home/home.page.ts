import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  QueryList,
  ViewChild,
  ViewChildren
} from '@angular/core';
import {
  GestureController,
  IonContent,
  IonModal,
  IonSearchbar,
  AlertController,
  ModalController,
  NavController,
  Platform,
  ToastController,
} from '@ionic/angular';
import { Subscription } from 'rxjs';

import { CryptoService } from "../services/crypto.service";
import { NotesService } from "../services/notes.service";
import { AppProtectorService } from "../services/app-protector.service";
import { DeleteNoteModalComponent } from '../delete-note-modal/delete-note-modal.component';
import { DeleteFolderModalComponent } from '../delete-folder-modal/delete-folder-modal.component';
import { ResetPassModalComponent } from '../restpass-modal/resetpass-modal.component';
import { TranslatorService } from '../services/translator.service';
import { AppHapticsService } from '../services/app-haptics.service';
import { NotesApiV1Service } from "../services/notes-api-v1.service";
import { SecureStorageService } from "../services/secure-storage.service";
import { ActivatedRoute, Router } from "@angular/router";
import { DataService } from "../services/data.service";
import { normalize } from "../utils/home-normalize.util";
import { initializePressGestures, LongPressConfig } from "../utils/home-gesture.util";
import { setDecryptedNotesAndParse } from "../utils/home-notes.util";
import { AuthService } from "../services/auth.service";

import {
  decryptTextWithMK,
  unpackCipherBlob,
} from '@stellarsecurity/stellar-crypto';
import { CryptoKeyService } from '../services/crypto-key.service';
import { ScrollService } from '../services/scroll.service';
import { Folder } from '../models/Folder';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage implements AfterViewInit, OnDestroy {
  private static readonly LONG_PRESS_DELAY_MS = 200;
  private static readonly LONG_PRESS_START_DELAY_MS = 100;
  private static readonly MOVE_TOLERANCE_PX = 15;
  private static readonly SEARCH_FOCUS_DELAY_MS = 100;
  private static readonly DETECT_CHANGES_DELAY_MS = 200;
  private static readonly PAGER_SWIPE_LOCK_X_PX = 10;
  private static readonly PAGER_SWIPE_DIRECTION_RATIO = 1.2;
  private static readonly PAGER_SNAP_RATIO = 0.32;
  private static readonly PAGER_SNAP_VELOCITY = 0.25;
  private static readonly PAGER_EDGE_RESISTANCE = 0.28;
  private static readonly PAGER_DRAG_RATIO = 0.95;
  private static readonly CHECKBOX_DISMISS_EDGE_PX = 120;
  private static readonly CHECKBOX_DISMISS_TRIGGER_PX = 56;
  private static readonly CHECKBOX_DISMISS_DIRECTION_RATIO = 1.2;

  @ViewChild(IonModal) modal: IonModal;
  @ViewChild('searchbar') searchbar: IonSearchbar;
  @ViewChild('pagerShell', { read: ElementRef }) pagerShell?: ElementRef<HTMLElement>;
  @ViewChildren('longPressElements', { read: ElementRef }) longPressElements: QueryList<ElementRef>;
  @ViewChild(IonContent, { static: false }) content!: IonContent;

  public notes: any[] = [];
  public folders: Folder[] = [];
  private pauseSync = false;
  private hiddenId: string | null = null;
  private destroyPressGestures: (() => void) | null = null;
  private pressGestureInitTimer: any = null;
  private longPressElementsChangesSub: Subscription | null = null;
  private backButtonSub: any = null;

  public should_display = true;
  public checkboxOpened = false;
  public listOfCheckedCheckboxes: string[] = [];
  public showPassword = false;
  public input_password_app_unlock = "";
  public timezone = "UTC";
  public search_query = "";
  public filteredResults: any[] = [];
  public visibleNotes: any[] = [];
  public allVisibleNotes: any[] = [];
  public favoriteVisibleNotes: any[] = [];
  public activeFilter: 'all' | 'favorites' = 'all';
  public activeFolderName: string = '__all__';
  public folderBrowserMode = true;
  public isPagerDragging = false;
  public pagerTransform = 'translate3d(0px, 0, 0)';
  public segmentLineTransform = 'translate3d(0%, 0, 0)';
  public isSearching = false;
  public isSyncing = false;
  public waitForSync = false;
  public searchMode = false;
  public headerHasShadow = false;
  public newFolderModalOpen = false;
  public newFolderName = '';
  public renamingFolderName: string | null = null;
  public renamingFolderDraft = '';

  timeout: any;
  isClicked: boolean = false;
  allTranslations: any;

  private mkRaw: Uint8Array | null = null;

  private syncTimer: any = null;
  private pendingDeletedNotes: any[] = [];
  private pendingDeletedIds: string[] = [];

  private scrollRestored = false;
  private url = this.router.url;
  private checkboxModeScrollTop = 0;

  private pagerTouchStartX: number | null = null;
  private pagerTouchStartY: number | null = null;
  private pagerLastX: number | null = null;
  private pagerLastMoveAt = 0;
  private pagerVelocityX = 0;
  private pagerDeltaX = 0;
  private pagerTracking = false;
  private pagerHorizontalLocked = false;
  private pagerWidth = 0;

  private checkboxDismissStartX: number | null = null;
  private checkboxDismissStartY: number | null = null;
  private checkboxDismissTracking = false;
  private folderPressTimer: any = null;
  public folderPressTriggered = false;

  public initialHomeLoadFinished = false;

  private folderBrowserModeBeforeSearch = true;
  private pendingCreateFolderResolver: ((value: boolean) => void) | null = null;
  private pendingCreateFolderOptions?: { keepCurrentView?: boolean; onCreated?: (folderName: string) => Promise<void> | void };
  private activeFolderNameBeforeSearch = '__all__';
  private activeFilterBeforeSearch: 'all' | 'favorites' = 'all';

  private readonly boundGlobalTouchEnd = () => {
    if (this.pagerTouchStartX !== null || this.pagerTracking || this.isPagerDragging) {
      this.onPagerTouchCancel();
    }
  };

  private readonly boundGlobalTouchCancel = () => {
    if (this.pagerTouchStartX !== null || this.pagerTracking || this.isPagerDragging) {
      this.onPagerTouchCancel();
    }
  };

  constructor(
    private cryptoService: CryptoService,
    public noteService: NotesService,
    private navController: NavController,
    private toastController: ToastController,
    private alertController: AlertController,
    private appProtectorService: AppProtectorService,
    private modalCtrl: ModalController,
    private route: ActivatedRoute,
    private dataService: DataService,
    private notesApiServiceV1: NotesApiV1Service,
    private translatorService: TranslatorService,
    private gestureCtrl: GestureController,
    private router: Router,
    private secureStorageService: SecureStorageService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    private crypto: CryptoKeyService,
    private scrollService: ScrollService,
    private appHaptics: AppHapticsService,
    private platform: Platform,
  ) {}


  public get folderVisibleNotes(): any[] {
    return this.activeFolderName === '__all__'
      ? this.visibleNotes
      : this.visibleNotes.filter((note: any) => (note?.folder ?? '') === this.activeFolderName);
  }

  public folderChipCount(folderName: string): number {
    return this.notes.filter((note: any) => (note?.folder ?? '') === folderName).length;
  }

  public get selectedFolderDisplayName(): string {
    return this.activeFolderName === '__all__'
      ? (this.allTranslations?.allNotes ?? 'All')
      : this.activeFolderName;
  }

  public get isRenamingSelectedFolder(): boolean {
    return !!this.renamingFolderName && this.renamingFolderName === this.activeFolderName && this.activeFolderName !== '__all__';
  }

  public get homeHeaderTitle(): string {
    if (this.checkboxOpened) {
      return `${this.listOfCheckedCheckboxes.length} ${this.allTranslations?.notesSelected ?? 'notes selected'}`;
    }

    if (this.folderBrowserMode) {
      return this.allTranslations?.folders ?? 'Folders';
    }

    return this.selectedFolderDisplayName;
  }

  public get totalNotesCount(): number {
    return this.notes.length;
  }

  public get favoriteNotesCount(): number {
    return this.notes.filter((note: any) => !!note?.favorite).length;
  }

  public get shouldShowFolderBrowser(): boolean {
    return !this.searchMode && this.folderBrowserMode;
  }

  public get canSearchNotes(): boolean {
    return this.notes.length > 0;
  }

  public get canSelectNotesFromCurrentView(): boolean {
    return !this.folderBrowserMode && this.visibleNotes.length > 0;
  }

  public get newNoteQueryParams(): Record<string, string> | null {
    if (this.folderBrowserMode) {
      return null;
    }

    if (this.activeFolderName === '__all__') {
      return null;
    }

    return { folder: this.activeFolderName };
  }

  public get currentFolderEmptyTitle(): string {
    return this.allTranslations?.folderEmptyTitle ?? 'No notes in this folder yet';
  }

  public get currentFolderEmptyDescription(): string {
    return this.allTranslations?.folderEmptyDescription ?? 'Tap + to add your first note here.';
  }


  public shouldShowNoteFolderLabel(note: any): boolean {
    const noteFolder = (note?.folder ?? '').trim();
    if (!noteFolder) {
      return false;
    }

    return !this.folderBrowserMode && (!this.activeFolderName || this.activeFolderName === '__all__');
  }

  public get hasAnyRenderedNotes(): boolean {
    return Array.isArray(this.filteredResults) && this.filteredResults.length > 0;
  }

  public get shouldShowHomeSkeleton(): boolean {
    if (!this.should_display) {
      return false;
    }

    if (this.waitForSync) {
      return true;
    }

    if (!this.initialHomeLoadFinished) {
      return true;
    }

    if (this.isSyncing && !this.hasAnyRenderedNotes) {
      return true;
    }

    return false;
  }

  private b64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  private async saveCheckboxModeScrollTop(): Promise<void> {
    try {
      const el = await this.content?.getScrollElement();
      this.checkboxModeScrollTop = el?.scrollTop ?? 0;
    } catch {
      this.checkboxModeScrollTop = 0;
    }
  }

  private restoreCheckboxModeScrollTop(): void {
    const y = this.checkboxModeScrollTop;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.content?.scrollToPoint(0, y, 0);
      });
    });
  }

  private schedulePressGestureInit(delay = 0): void {
    if (this.pressGestureInitTimer) {
      clearTimeout(this.pressGestureInitTimer);
      this.pressGestureInitTimer = null;
    }

    this.pressGestureInitTimer = setTimeout(() => {
      this.initializePressGesture();
      this.pressGestureInitTimer = null;
    }, delay);
  }

  private registerBackButtonHandler(): void {
    if (this.backButtonSub) {
      this.backButtonSub.unsubscribe();
      this.backButtonSub = null;
    }

    this.backButtonSub = this.platform.backButton.subscribeWithPriority(1000, () => {
      if (this.checkboxOpened) {
        this.toggleCheckbox().then(() => {});
        return;
      }

      if (this.searchMode) {
        this.exitSearchMode();
        return;
      }

      if (!this.folderBrowserMode) {
        this.backToFolders();
      }
    });
  }

  ngAfterViewInit(): void {
    this.longPressElementsChangesSub = this.longPressElements.changes.subscribe(() => {
      this.schedulePressGestureInit();
    });

    this.schedulePressGestureInit();
  }

  ngOnDestroy(): void {
    if (this.pressGestureInitTimer) {
      clearTimeout(this.pressGestureInitTimer);
      this.pressGestureInitTimer = null;
    }

    if (this.longPressElementsChangesSub) {
      this.longPressElementsChangesSub.unsubscribe();
      this.longPressElementsChangesSub = null;
    }

    if (this.destroyPressGestures) {
      this.destroyPressGestures();
      this.destroyPressGestures = null;
    }

    if (this.backButtonSub) {
      this.backButtonSub.unsubscribe();
      this.backButtonSub = null;
    }

    window.removeEventListener('touchend', this.boundGlobalTouchEnd);
    window.removeEventListener('touchcancel', this.boundGlobalTouchCancel);
  }

  async ionViewWillEnter() {
    this.initialHomeLoadFinished = false;
    this.headerHasShadow = false;

    this.scrollRestored = false;
    this.resetPagerTouch();
    this.resetCheckboxDismissGesture();

    if (this.pauseSync) this.pauseSync = false;

    this.hiddenId = this.route.snapshot.queryParamMap.get('hide_ids');

    if (this.dataService.getForceDownloadOnHome() && this.authService.isLoggedIn) {
      this.waitForSync = true;
    }

    if (!this.noteService.appHasPasswordChallenge()) {
      const eakB64 = await this.secureStorageService.getItem('ssEakB64');
      if (eakB64) {
        this.mkRaw = this.b64ToBytes(eakB64);
      }
    }

    this.allTranslations = this.translatorService.allTranslations;
    this.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (this.noteService.shouldAskForPassword()) {
      this.should_display = false;
      this.initialHomeLoadFinished = true;
    } else {
      this.setData(this.noteService.getNotesAppPassword());
      this.restoreScrollOnce();
      this.schedulePressGestureInit();
      this.initialHomeLoadFinished = true;
      this.syncFromServer().then(() => {});
    }
  }

  private async restoreScrollOnce() {
    if (this.scrollRestored) return;
    this.scrollRestored = true;

    const y = this.scrollService.get(this.url);

    requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        await this.content?.scrollToPoint(0, y, 0);
      });
    });
  }

  ionViewDidEnter() {
    this.schedulePressGestureInit();
    this.registerBackButtonHandler();
    window.addEventListener('touchend', this.boundGlobalTouchEnd, { passive: true });
    window.addEventListener('touchcancel', this.boundGlobalTouchCancel, { passive: true });
  }

  async ionViewWillLeave() {
    if (this.searchMode) {
      this.exitSearchMode();
    }
    this.pauseSync = true;
    this.scrollRestored = false;
    this.headerHasShadow = false;
    this.resetPagerTouch();
    this.resetCheckboxDismissGesture();

    window.removeEventListener('touchend', this.boundGlobalTouchEnd);
    window.removeEventListener('touchcancel', this.boundGlobalTouchCancel);

    if (this.backButtonSub) {
      this.backButtonSub.unsubscribe();
      this.backButtonSub = null;
    }

    if (this.pressGestureInitTimer) {
      clearTimeout(this.pressGestureInitTimer);
      this.pressGestureInitTimer = null;
    }

    if (this.destroyPressGestures) {
      this.destroyPressGestures();
      this.destroyPressGestures = null;
    }

    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    const el = await this.content.getScrollElement();
    this.scrollService.save(this.url, el.scrollTop);
  }

  enterSearchMode() {
    this.resetPagerTouch();
    this.resetCheckboxDismissGesture();
    this.folderBrowserModeBeforeSearch = this.folderBrowserMode;
    this.activeFolderNameBeforeSearch = this.activeFolderName;
    this.activeFilterBeforeSearch = this.activeFilter;

    this.searchMode = true;
    this.folderBrowserMode = false;
    this.activeFolderName = '__all__';
    this.activeFilter = 'all';
    this.refreshVisibleNotes();

    setTimeout(() => {
      this.searchbar?.setFocus();
    }, HomePage.SEARCH_FOCUS_DELAY_MS);
  }

  exitSearchMode() {
    this.resetPagerTouch();
    this.resetCheckboxDismissGesture();
    this.search_query = '';
    this.pauseSync = false;
    this.search();

    setTimeout(() => {
      this.searchMode = false;
      this.folderBrowserMode = this.folderBrowserModeBeforeSearch;
      this.activeFolderName = this.activeFolderNameBeforeSearch;
      this.activeFilter = this.activeFilterBeforeSearch;
      this.refreshVisibleNotes();
      this.cdr.detectChanges();
      this.schedulePressGestureInit();
    }, HomePage.DETECT_CHANGES_DELAY_MS);
  }

  public onHomeScroll(event: CustomEvent) {
    const scrollTop = event?.detail?.scrollTop ?? 0;
    this.headerHasShadow = scrollTop > 8;
  }

  public async toggleCheckbox() {
    this.appHaptics.selectionChanged();
    this.resetPagerTouch();
    this.resetCheckboxDismissGesture();

    await this.saveCheckboxModeScrollTop();

    this.checkboxOpened = !this.checkboxOpened;
    if (!this.checkboxOpened) {
      this.listOfCheckedCheckboxes = [];
      this.pauseSync = false;
    } else {
      this.pauseSync = true;
    }

    setTimeout(() => {
      this.cdr.detectChanges();
      this.schedulePressGestureInit();
      this.restoreCheckboxModeScrollTop();
    }, HomePage.DETECT_CHANGES_DELAY_MS);
  }

  public onCheckboxDismissTouchStart(event: TouchEvent) {
    if (!this.checkboxOpened || !event.touches || event.touches.length !== 1) {
      this.resetCheckboxDismissGesture();
      return;
    }

    const touch = event.touches[0];

    if (touch.clientX > HomePage.CHECKBOX_DISMISS_EDGE_PX) {
      this.resetCheckboxDismissGesture();
      return;
    }

    this.checkboxDismissStartX = touch.clientX;
    this.checkboxDismissStartY = touch.clientY;
    this.checkboxDismissTracking = true;
  }

  public onCheckboxDismissTouchMove(event: TouchEvent) {
    if (
      !this.checkboxOpened ||
      !this.checkboxDismissTracking ||
      this.checkboxDismissStartX === null ||
      this.checkboxDismissStartY === null ||
      !event.touches ||
      event.touches.length !== 1
    ) {
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - this.checkboxDismissStartX;
    const deltaY = touch.clientY - this.checkboxDismissStartY;

    if (deltaX <= 0) {
      return;
    }

    if (Math.abs(deltaX) <= Math.abs(deltaY) * HomePage.CHECKBOX_DISMISS_DIRECTION_RATIO) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    if (deltaX >= HomePage.CHECKBOX_DISMISS_TRIGGER_PX) {
      this.toggleCheckbox().then(() => {});
      this.resetCheckboxDismissGesture();
    }
  }

  public onCheckboxDismissTouchEnd() {
    this.resetCheckboxDismissGesture();
  }

  private resetCheckboxDismissGesture() {
    this.checkboxDismissStartX = null;
    this.checkboxDismissStartY = null;
    this.checkboxDismissTracking = false;
  }

  search() {
    this.resetPagerTouch();
    this.resetCheckboxDismissGesture();

    if (this.search_query.length == 0) {
      this.isSearching = false;
      this.filteredResults = this.notes;
      this.refreshVisibleNotes();
      return;
    }

    const normalizedQuery = normalize(this.search_query);
    const filteredNewResults: any[] = [];

    for (let i = 0; this.notes.length > i; i++) {
      const normalizedText = normalize(this.notes[i]?.text);
      const result = normalizedText.includes(normalizedQuery);

      let titleExists = false;
      if (this.notes[i].title !== undefined) {
        const normalizedTitle = normalize(this.notes[i]?.title);
        titleExists = normalizedTitle.includes(normalizedQuery);
      }

      const normalizedFolder = normalize(this.notes[i]?.folder ?? '');
      const folderMatches = normalizedFolder.includes(normalizedQuery);

      if (result && !this.notes[i].protected) {
        filteredNewResults.push(this.notes[i]);
      } else if (titleExists || folderMatches) {
        filteredNewResults.push(this.notes[i]);
      }
    }

    this.isSearching = true;
    this.pauseSync = true;
    this.filteredResults = filteredNewResults;
    this.refreshVisibleNotes();

    setTimeout(() => {
      this.cdr.detectChanges();
      this.schedulePressGestureInit();
    }, HomePage.DETECT_CHANGES_DELAY_MS);
  }

  initializePressGesture(): void {
    if (this.destroyPressGestures) {
      this.destroyPressGestures();
      this.destroyPressGestures = null;
    }

    if (!this.longPressElements || this.longPressElements.length === 0) {
      return;
    }

    const cfg: LongPressConfig = {
      delayMs: HomePage.LONG_PRESS_DELAY_MS,
      moveTolerancePx: HomePage.MOVE_TOLERANCE_PX,
      startDelayMs: HomePage.LONG_PRESS_START_DELAY_MS,
    };

    this.destroyPressGestures = initializePressGestures(
      this.longPressElements,
      this.gestureCtrl,
      (nativeEl) => this.handlePressStart(nativeEl),
      () => this.handlePressEnd(),
      cfg
    );
  }

  handlePressStart(element: any) {
    this.resetPagerTouch();
    this.resetCheckboxDismissGesture();
    this.appHaptics.selectionStart();

    this.timeout = setTimeout(async () => {
      await this.saveCheckboxModeScrollTop();

      this.checkboxOpened = true;
      this.pauseSync = true;
      this.resetPagerTouch();
      this.resetCheckboxDismissGesture();

      setTimeout(() => {
        this.cdr.detectChanges();
        const noteId = element.id;

        if (!this.listOfCheckedCheckboxes.includes(noteId)) {
          const checkboxEle = element.children[0].children[0];
          checkboxEle.checked = true;
          this.listOfCheckedCheckboxes.push(noteId);
        }

        this.appHaptics.impactMedium();
        this.appHaptics.selectionChanged();

        setTimeout(() => {
          this.cdr.detectChanges();
          this.schedulePressGestureInit();
          this.restoreCheckboxModeScrollTop();
        }, HomePage.DETECT_CHANGES_DELAY_MS);
      }, HomePage.LONG_PRESS_START_DELAY_MS);
    }, HomePage.LONG_PRESS_START_DELAY_MS);
  }

  handlePressEnd() {
    clearTimeout(this.timeout);
    this.appHaptics.selectionEnd();
    this.resetPagerTouch();
  }

  private normalizeFolderId(folderId: any): string | null {
    return typeof folderId === 'string' && folderId.trim().length > 0 ? folderId.trim() : null;
  }

  private getStoredFolders(password: string = ''): Folder[] {
    try {
      const rawFolders = this.noteService.getFolders();
      const decodedFolders = this.noteService.appHasPasswordChallenge()
        ? this.cryptoService.decrypt(rawFolders, password || this.noteService.getNotesAppPassword())
        : rawFolders;
      const parsedFolders = decodedFolders ? JSON.parse(decodedFolders) : [];
      if (!Array.isArray(parsedFolders)) {
        return [];
      }
      return parsedFolders
        .map((folder: any) => ({
          id: this.normalizeFolderId(folder?.id) ?? (crypto?.randomUUID?.() ?? String(Date.now() + Math.random())),
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
    await this.notesApiServiceV1.upload(0, [], undefined, this.getStoredFolders(this.noteService.getNotesAppPassword()));
  }

  private resolveFolderIdByName(name: string): string | null {
    const normalizedName = (name ?? '').trim().toLowerCase();
    if (!normalizedName) {
      return null;
    }
    return this.folders.find((folder) => (folder.name ?? '').trim().toLowerCase() === normalizedName)?.id ?? null;
  }

  private loadFolders(password: string = ''): void {
    let parsedFolders: Folder[] = [];
    try {
      parsedFolders = this.getStoredFolders(password);
    } catch {
      parsedFolders = [];
    }

    const folderMap = new Map<string, Folder>();

    for (const folder of parsedFolders ?? []) {
      const name = (folder?.name ?? '').trim();
      if (!name || folder.deleted) {
        continue;
      }
      folderMap.set(name.toLowerCase(), {
        id: folder.id,
        name,
        last_modified: folder?.last_modified ?? Date.now(),
        deleted: false,
      });
    }

    for (const note of this.notes ?? []) {
      const name = (note?.folder ?? '').trim();
      if (!name) {
        continue;
      }
      if (!folderMap.has(name.toLowerCase())) {
        folderMap.set(name.toLowerCase(), {
          id: this.normalizeFolderId((note as any)?.folder_id) ?? (crypto?.randomUUID?.() ?? String(Date.now() + Math.random())),
          name,
          last_modified: note?.last_modified ?? Date.now(),
          deleted: false,
        });
      }
    }

    this.folders = Array.from(folderMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    if (this.activeFolderName !== '__all__'
      && !this.folders.some((folder) => folder.name === this.activeFolderName)) {
      this.activeFolderName = '__all__';
    }
  }


  private async decryptFolderNameWithMK(rawName: string, folderId: string | null | undefined): Promise<string> {
    const normalizedRaw = (rawName ?? '').trim();
    const normalizedFolderId = this.normalizeFolderId(folderId);
    if (!normalizedRaw || !normalizedFolderId || !this.mkRaw) {
      return normalizedRaw;
    }

    try {
      const blobName = unpackCipherBlob(normalizedRaw);
      return await decryptTextWithMK(this.mkRaw, {
        ...blobName,
        v: 1,
        aad_b64: btoa(normalizedFolderId + '#folder-name'),
      });
    } catch {
      return normalizedRaw;
    }
  }

  private async decryptServerFolders(serverFolders: any[]): Promise<Map<string, string>> {
    const folderNameById = new Map<string, string>();

    for (const folder of serverFolders ?? []) {
      const folderId = this.normalizeFolderId((folder as any)?.id);
      if (!folderId) {
        continue;
      }

      const decryptedName = folder?.deleted
        ? ''
        : await this.decryptFolderNameWithMK((folder?.name ?? '').trim(), folderId);

      folderNameById.set(folderId, decryptedName);
    }

    return folderNameById;
  }

  private setData(password: string = ""): boolean {
    const { parsed } = setDecryptedNotesAndParse(this.noteService, this.cryptoService, password);
    if (!parsed && this.noteService.appHasPasswordChallenge()) {
      return false;
    }

    this.notes = (parsed ?? []).map((note: any) => ({
      ...note,
      favorite: !!note?.favorite,
      pinned: !!note?.pinned,
      folder: (note?.folder ?? '').trim(),
      folder_id: this.normalizeFolderId((note as any)?.folder_id),
    }));
    this.loadFolders(password);
    this.filteredResults = this.notes;
    this.refreshVisibleNotes();
    return true;
  }

  public isLoggedIn() {
    return this.authService.isLoggedIn;
  }

  handleRefresh(event: Event) {
    (event.target as HTMLIonRefresherElement).complete();

    this.waitForSync = true;
    this.dataService.setForceDownloadOnHome(true);
    this.syncFromServer();
  }

  async syncFromServer() {
    if (!this.authService.isLoggedIn) return;
    if (this.pauseSync) return;

    if (this.syncTimer == null) {
      this.syncTimer = setInterval(() => {
        if (!this.pauseSync && this.authService.isLoggedIn) {
          this.syncFromServer();
        }
      }, 30_000);
    }

    this.isSyncing = true;

    try {
      const res = await this.notesApiServiceV1.download(0);

      const serverNotes = res?.notes ?? [];
      const serverFolders = Array.isArray((res as any)?.folders) ? (res as any).folders : [];
      const decryptedFolderNameById = await this.decryptServerFolders(serverFolders);
      const map = new Map<string, any>((this.notes ?? []).map((n: any) => [n.id, n]));

      for (const s of serverNotes) {
        const local = map.get(s.id);

        if (this.hiddenId === s.id) {
          map.delete(s.id);
          continue;
        }

        if (s.deleted) {
          if (!local || (s.last_modified ?? 0) >= (local?.last_modified ?? 0)) {
            map.delete(s.id);
          }

          this.noteService.reconcileServerConfirmation(s);
          continue;
        }

        if (this.noteService.shouldIgnoreServerNote(s)) {
          continue;
        }

        if (!this.mkRaw) {
          continue;
        }

        const blobText = unpackCipherBlob(s.text);
        s.text = await decryptTextWithMK(this.mkRaw, {
          ...blobText,
          v: 1,
          aad_b64: btoa(s.id)
        });

        s.favorite = !!(s.favorite ?? local?.favorite);
        s.pinned = !!(s.pinned ?? local?.pinned);

        if (typeof s.title === 'string' && s.title.length > 0) {
          const blobTitle = unpackCipherBlob(s.title);
          s.title = await decryptTextWithMK(
            this.mkRaw,
            { ...blobTitle, v: 1, aad_b64: btoa(s.id + '#title') }
          );
        } else {
          s.title = '';
        }

        const noteFolderId = this.normalizeFolderId((s as any)?.folder_id);
        s.folder_id = noteFolderId;
        s.folder = noteFolderId ? (decryptedFolderNameById.get(noteFolderId) ?? '') : '';

        if (!local) {
          map.set(s.id, s);
          this.noteService.reconcileServerConfirmation(s);
          continue;
        }

        if ((s.last_modified ?? 0) >= (local.last_modified ?? 0)) {
          map.set(s.id, { ...local, ...s });
        }

        this.noteService.reconcileServerConfirmation(s);
      }

      const merged = Array.from(map.values()).filter((n: any) => !n.deleted);
      this.notes = merged;
      this.filteredResults = merged;
      this.refreshVisibleNotes();

      const localFolders = this.getStoredFolders(this.noteService.getNotesAppPassword());
      const folderMap = new Map<string, any>();
      for (const folder of localFolders) {
        const key = this.normalizeFolderId((folder as any)?.id) ?? `name:${(folder?.name ?? '').trim().toLowerCase()}`;
        folderMap.set(key, folder);
      }
      for (const folder of serverFolders) {
        const normalizedFolderId = this.normalizeFolderId((folder as any)?.id) ?? (crypto?.randomUUID?.() ?? String(Date.now() + Math.random()));
        const normalizedFolder = {
          id: normalizedFolderId,
          name: folder?.deleted ? '' : (decryptedFolderNameById.get(normalizedFolderId) ?? '').trim(),
          last_modified: Number(folder?.last_modified ?? 0),
          deleted: !!folder?.deleted,
        };
        const key = normalizedFolder.id as string;
        const localFolder = folderMap.get(key);
        if (!localFolder || normalizedFolder.last_modified >= Number(localFolder?.last_modified ?? 0)) {
          folderMap.set(key, normalizedFolder);
        }
      }

      if (this.noteService.appHasPasswordChallenge()) {
        const encryptedNotesSave = this.cryptoService.encrypt(
          JSON.stringify(merged),
          this.noteService.getNotesAppPassword()
        );
        this.noteService.setNotes(encryptedNotesSave);
        const encryptedFoldersSave = this.cryptoService.encrypt(
          JSON.stringify(Array.from(folderMap.values())),
          this.noteService.getNotesAppPassword()
        );
        this.noteService.setFolders(encryptedFoldersSave);
      } else {
        this.noteService.setNotes(JSON.stringify(merged));
        this.noteService.setFolders(JSON.stringify(Array.from(folderMap.values())));
      }

      await this.noteService.flushPersistence();
      this.setData(this.noteService.getNotesAppPassword());
    } catch (err) {
    } finally {
      this.isSyncing = false;
      this.waitForSync = false;
      this.dataService.setForceDownloadOnHome(false);
    }
  }

  public togglePasswordVisibility() {
    this.appHaptics.selectionChanged();
    this.showPassword = !this.showPassword;
  }

  private formatLockoutMessage(remainingMs: number): string {
    const totalSeconds = Math.max(1, Math.ceil(remainingMs / 1000));

    if (totalSeconds >= 60) {
      const minutes = Math.ceil(totalSeconds / 60);
      const template = this.allTranslations?.tooManyFailedAttemptsTryAgainInMinutes ?? 'Too many failed attempts. Try again in {{count}} minute{{suffix}}.';
      return template.replace('{{count}}', String(minutes)).replace('{{suffix}}', minutes === 1 ? '' : 's');
    }

    const template = this.allTranslations?.tooManyFailedAttemptsTryAgainInSeconds ?? 'Too many failed attempts. Try again in {{count}} second{{suffix}}.';
    return template.replace('{{count}}', String(totalSeconds)).replace('{{suffix}}', totalSeconds === 1 ? '' : 's');
  }

  public async unlockNotesApp() {
    const lockoutRemaining = this.noteService.getAppUnlockLockoutRemainingMs();
    if (lockoutRemaining > 0) {
      const toast = await this.toastController.create({
        message: this.formatLockoutMessage(lockoutRemaining),
        duration: 3000,
        position: 'bottom',
      });
      await this.appHaptics.warning();
      await toast.present();
      this.should_display = false;
      return;
    }

    if (this.input_password_app_unlock.length == 0) {
      const toast = await this.toastController.create({
        message: this.allTranslations?.pleaseEnterYourPasswordMessage ?? 'Please enter your password.',
        duration: 3000,
        position: 'bottom',
      });
      await this.appHaptics.warning();
      await toast.present();
      return;
    }

    try {
      this.should_display = true;

      this.noteService.setNotesAppPassword(this.input_password_app_unlock);
      this.setData(this.input_password_app_unlock);

      let eakB64 = await this.secureStorageService.getItem('ssEakB64_Encrypted');
      if (eakB64) {
        eakB64 = this.cryptoService.decrypt(eakB64, this.input_password_app_unlock) as string;
        this.mkRaw = this.b64ToBytes(eakB64);

        await this.crypto.importEAK(eakB64);
      }

      this.noteService.clearAppUnlockFailures();
      this.noteService.recordSuccessfulAppUnlock();
      await this.noteService.flushPersistence();

      this.appProtectorService.init();

      this.input_password_app_unlock = "";

      this.syncFromServer().then(() => {});

      setTimeout(() => {
        this.cdr.detectChanges();
        this.schedulePressGestureInit();
      }, HomePage.DETECT_CHANGES_DELAY_MS);

      await this.appHaptics.success();
      return;
    } catch (e: any) {
      const lockoutMs = this.noteService.registerFailedAppUnlockAttempt();
      await this.noteService.flushPersistence();

      const toast = await this.toastController.create({
        message:
          lockoutMs > 0
            ? this.formatLockoutMessage(lockoutMs)
            : this.allTranslations.passwordIsNotCorrectTryAgain,
        duration: 3000,
        position: 'bottom',
      });

      this.noteService.clearSensitiveRuntimeState();
      this.should_display = false;
      this.input_password_app_unlock = "";

      await this.appHaptics.error();
      await toast.present();
      return;
    }
  }

  private sortNotes(source: any[]): any[] {
    return [...source].sort((a: any, b: any) => {
      const pinnedDiff = Number(!!b?.pinned) - Number(!!a?.pinned);
      if (pinnedDiff !== 0) {
        return pinnedDiff;
      }
      return (b?.last_modified ?? 0) - (a?.last_modified ?? 0);
    });
  }

  private syncVisibleNotesFromActiveFilter() {
    this.visibleNotes = this.activeFilter === 'favorites'
      ? [...this.favoriteVisibleNotes]
      : [...this.allVisibleNotes];
  }

  private getPagerIndex(): number {
    return this.activeFilter === 'favorites' ? 1 : 0;
  }

  private setPagerWidthFromEvent(event?: TouchEvent) {
    const target = event?.currentTarget as HTMLElement | null;
    const width = target?.clientWidth ?? this.pagerShell?.nativeElement?.clientWidth ?? 0;
    if (width > 0) {
      this.pagerWidth = width;
    }
  }

  private updatePagerTransform(offsetX = 0) {
    const width = this.pagerWidth || this.pagerShell?.nativeElement?.clientWidth || 0;
    const baseX = -this.getPagerIndex() * width;
    this.pagerTransform = `translate3d(${baseX + offsetX}px, 0, 0)`;
  }

  private updateSegmentLine(offsetPx = 0) {
    const width = this.pagerWidth || this.pagerShell?.nativeElement?.clientWidth || 1;
    const currentIndex = this.getPagerIndex();
    const progress = Math.max(0, Math.min(1, currentIndex + (-offsetPx / width)));
    this.segmentLineTransform = `translate3d(${progress * 100}%, 0, 0)`;
  }

  private refreshVisibleNotes() {
    const sorted = [...(this.filteredResults ?? [])].sort((a: any, b: any) => {
      const aPinned = a?.pinned ? 1 : 0;
      const bPinned = b?.pinned ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return (b?.last_modified ?? 0) - (a?.last_modified ?? 0);
    });

    const folderScoped = sorted.filter((note: any) => {
      const noteFolder = (note?.folder ?? '').trim();
      if (this.activeFolderName === '__all__') {
        return true;
      }
      return noteFolder === this.activeFolderName;
    });

    this.allVisibleNotes = folderScoped;
    this.favoriteVisibleNotes = folderScoped.filter((note: any) => !!note?.favorite);
    this.syncVisibleNotesFromActiveFilter();

    if (!this.isPagerDragging) {
      this.updatePagerTransform();
      this.updateSegmentLine();
    }

    this.schedulePressGestureInit();
  }

  public get shouldUsePager(): boolean {
    return !this.checkboxOpened
      && !this.searchMode
      && !this.isSearching
      && !this.folderBrowserMode
      && Array.isArray(this.allVisibleNotes)
      && this.allVisibleNotes.length > 0;
  }

  public setActiveFilter(filter: 'all' | 'favorites') {
    this.resetPagerTouch();

    const changed = this.activeFilter !== filter;

    this.activeFilter = filter;
    this.syncVisibleNotesFromActiveFilter();
    this.updatePagerTransform();
    this.updateSegmentLine();
    this.schedulePressGestureInit();

    if (changed && filter === 'favorites') {
      requestAnimationFrame(() => {
        this.content?.scrollToTop(220);
      });
    }
  }

  public onActiveFilterChange(value: unknown) {
    const nextFilter = value === 'favorites' ? 'favorites' : 'all';
    this.setActiveFilter(nextFilter);
  }

  public onPagerTouchStart(event: TouchEvent) {
    if (event.touches.length !== 1 || !this.shouldUsePager) {
      this.resetPagerTouch();
      return;
    }

    this.setPagerWidthFromEvent(event);

    const touch = event.touches[0];
    this.pagerTouchStartX = touch.clientX;
    this.pagerTouchStartY = touch.clientY;
    this.pagerLastX = touch.clientX;
    this.pagerLastMoveAt = Date.now();
    this.pagerVelocityX = 0;
    this.pagerDeltaX = 0;
    this.pagerTracking = true;
    this.pagerHorizontalLocked = false;
    this.isPagerDragging = false;
  }

  public onPagerTouchMove(event: TouchEvent) {
    if (
      !this.shouldUsePager ||
      !this.pagerTracking ||
      this.pagerTouchStartX === null ||
      this.pagerTouchStartY === null ||
      event.touches.length !== 1
    ) {
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - this.pagerTouchStartX;
    const deltaY = touch.clientY - this.pagerTouchStartY;

    if (!this.pagerHorizontalLocked) {
      if (Math.abs(deltaX) < HomePage.PAGER_SWIPE_LOCK_X_PX) {
        return;
      }

      if (Math.abs(deltaX) <= Math.abs(deltaY) * HomePage.PAGER_SWIPE_DIRECTION_RATIO) {
        this.resetPagerTouch();
        return;
      }

      this.pagerHorizontalLocked = true;
      this.isPagerDragging = true;
      this.setPagerWidthFromEvent(event);
    }

    const now = Date.now();
    if (this.pagerLastX !== null) {
      const dt = Math.max(now - this.pagerLastMoveAt, 1);
      this.pagerVelocityX = (touch.clientX - this.pagerLastX) / dt;
    }

    this.pagerLastX = touch.clientX;
    this.pagerLastMoveAt = now;
    this.pagerDeltaX = deltaX;

    const currentIndex = this.getPagerIndex();
    const isOverdraggingLeftEdge = currentIndex === 0 && deltaX > 0;
    const isOverdraggingRightEdge = currentIndex === 1 && deltaX < 0;
    const offsetX = (isOverdraggingLeftEdge || isOverdraggingRightEdge)
      ? deltaX * HomePage.PAGER_EDGE_RESISTANCE
      : deltaX * HomePage.PAGER_DRAG_RATIO;

    this.updatePagerTransform(offsetX);
    this.updateSegmentLine(offsetX);

    if (event.cancelable) {
      event.preventDefault();
    }
  }

  public async onPagerTouchEnd() {
    if (this.pagerTouchStartX === null || this.pagerTouchStartY === null) {
      this.resetPagerTouch();
      return;
    }

    if (!this.pagerHorizontalLocked) {
      this.resetPagerTouch();
      return;
    }

    const width = this.pagerWidth || this.pagerShell?.nativeElement?.clientWidth || 1;
    const currentIndex = this.getPagerIndex();
    const shouldSnapToNextPage =
      Math.abs(this.pagerDeltaX) > width * HomePage.PAGER_SNAP_RATIO
      || Math.abs(this.pagerVelocityX) > HomePage.PAGER_SNAP_VELOCITY;

    let nextIndex = currentIndex;
    if (shouldSnapToNextPage) {
      if (this.pagerDeltaX < 0) {
        nextIndex = Math.min(1, currentIndex + 1);
      } else if (this.pagerDeltaX > 0) {
        nextIndex = Math.max(0, currentIndex - 1);
      }
    }

    const nextFilter: 'all' | 'favorites' = nextIndex === 1 ? 'favorites' : 'all';
    const changed = nextFilter !== this.activeFilter;

    this.activeFilter = nextFilter;
    this.syncVisibleNotesFromActiveFilter();
    this.isPagerDragging = false;
    this.updatePagerTransform();
    this.updateSegmentLine();
    this.schedulePressGestureInit();

    this.resetPagerTouch(false);

    if (changed && nextFilter === 'favorites') {
      requestAnimationFrame(() => {
        this.content?.scrollToTop(220);
      });
    }
  }

  public onPagerTouchCancel() {
    this.isPagerDragging = false;
    this.updatePagerTransform();
    this.updateSegmentLine();
    this.resetPagerTouch(false);
  }

  private resetPagerTouch(resetTransform = true) {
    this.pagerTouchStartX = null;
    this.pagerTouchStartY = null;
    this.pagerLastX = null;
    this.pagerLastMoveAt = 0;
    this.pagerVelocityX = 0;
    this.pagerDeltaX = 0;
    this.pagerTracking = false;
    this.pagerHorizontalLocked = false;
    this.isPagerDragging = false;

    if (resetTransform) {
      this.updatePagerTransform();
      this.updateSegmentLine();
    }
  }

  public isPrivacyModeEnabled(): boolean {
    return this.noteService.isPrivacyModeEnabled();
  }

  private restorePendingDeletedNotes() {
    if (!this.pendingDeletedNotes.length) {
      this.pendingDeletedIds = [];
      return;
    }

    for (const note of this.pendingDeletedNotes) {
      if (note?.id) {
        this.noteService.clearPendingMutation(note.id);
      }
    }

    this.notes = [...this.notes, ...this.pendingDeletedNotes];
    this.pendingDeletedNotes = [];
    this.pendingDeletedIds = [];

    if (this.search_query.length > 0) {
      this.search();
      return;
    }

    this.filteredResults = this.notes;
    this.refreshVisibleNotes();
  }

  private async commitPendingDelete() {
    if (!this.pendingDeletedIds.length) {
      return;
    }

    const deletedIds = [...this.pendingDeletedIds];
    this.pendingDeletedNotes = [];
    this.pendingDeletedIds = [];

    if (this.noteService.appHasPasswordChallenge()) {
      const encryptedNotesSave = this.cryptoService.encrypt(
        JSON.stringify(this.notes),
        this.noteService.getNotesAppPassword()
      );
      this.noteService.setAppPasswordChallengeEnabled(true);
      this.noteService.setNotes(encryptedNotesSave);
    } else {
      this.noteService.setNotes(JSON.stringify(this.notes));
    }

    this.noteService.setDecryptedNotes(JSON.stringify(this.notes));
    await this.noteService.flushPersistence();

    if (this.authService.isLoggedIn) {
      this.notesApiServiceV1.deleteNotes(deletedIds).then(() => {});
    }
  }

  trackByNoteId(index: number, note: any): string {
    return note?.id ?? String(index);
  }

  getNotes() {
    return this.visibleNotes;
  }

  private async persistNotesState() {
    if (this.noteService.appHasPasswordChallenge()) {
      const encryptedNotesSave = this.cryptoService.encrypt(
        JSON.stringify(this.notes),
        this.noteService.getNotesAppPassword()
      );
      this.noteService.setNotes(encryptedNotesSave);
    } else {
      this.noteService.setNotes(JSON.stringify(this.notes));
    }
    this.noteService.setDecryptedNotes(JSON.stringify(this.notes));
    await this.noteService.flushPersistence();

    if (this.authService.isLoggedIn) {
      this.notesApiServiceV1.upload(0, this.notes, undefined, this.getStoredFolders(this.noteService.getNotesAppPassword())).then(() => {});
    }
  }

  public async togglePinnedFromHome(event: Event, noteId: string) {
    event?.stopPropagation();
    event?.preventDefault();
    await this.appHaptics.selectionChanged();

    const targetNote = this.notes.find((note: any) => note?.id === noteId);
    if (!targetNote) {
      return;
    }

    targetNote.pinned = !targetNote.pinned;
    targetNote.last_modified = Date.now();

    this.noteService.markPendingMutation(noteId, 'pin', targetNote.last_modified);

    if (this.filteredResults !== this.notes) {
      const filteredNote = this.filteredResults.find((note: any) => note?.id === noteId);
      if (filteredNote) {
        filteredNote.pinned = targetNote.pinned;
        filteredNote.last_modified = targetNote.last_modified;
      }
    }

    this.refreshVisibleNotes();
    await this.persistNotesState();
  }

  public async toggleFavoriteFromHome(event: Event, noteId: string) {
    event?.stopPropagation();
    event?.preventDefault();
    await this.appHaptics.selectionChanged();

    const targetNote = this.notes.find((note: any) => note?.id === noteId);
    if (!targetNote) {
      return;
    }

    targetNote.favorite = !targetNote.favorite;
    targetNote.last_modified = Date.now();

    this.noteService.markPendingMutation(noteId, 'favorite', targetNote.last_modified);

    if (this.filteredResults !== this.notes) {
      const filteredNote = this.filteredResults.find((note: any) => note?.id === noteId);
      if (filteredNote) {
        filteredNote.favorite = targetNote.favorite;
        filteredNote.last_modified = targetNote.last_modified;
      }
    }

    this.refreshVisibleNotes();
    await this.persistNotesState();
  }


  public backToFolders(): void {
    this.resetPagerTouch();
    this.resetCheckboxDismissGesture();
    this.folderBrowserMode = true;
    this.activeFilter = 'all';
    this.syncVisibleNotesFromActiveFilter();
    this.updatePagerTransform();
    this.updateSegmentLine();

    requestAnimationFrame(() => {
      this.content?.scrollToTop(200);
    });
  }

  public selectFolder(folderName: string): void {
    this.resetPagerTouch();
    this.resetCheckboxDismissGesture();
    this.activeFolderName = folderName;
    this.folderBrowserMode = false;
    this.activeFilter = 'all';
    this.refreshVisibleNotes();

    requestAnimationFrame(() => {
      this.content?.scrollToTop(200);
    });
  }

  public startRenameSelectedFolder(): void {
    if (this.folderBrowserMode || this.activeFolderName === '__all__') {
      return;
    }

    this.renamingFolderName = this.activeFolderName;
    this.renamingFolderDraft = this.activeFolderName;
  }

  public cancelRenameSelectedFolder(): void {
    this.renamingFolderName = null;
    this.renamingFolderDraft = '';
  }

  public async handleRenameSelectedFolderKeydown(event: KeyboardEvent): Promise<void> {
    if (event.key === 'Enter') {
      event.preventDefault();
      await this.commitRenameSelectedFolder();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelRenameSelectedFolder();
    }
  }

  public async commitRenameSelectedFolder(): Promise<void> {
    const oldName = (this.renamingFolderName ?? '').trim();
    const newName = (this.renamingFolderDraft ?? '').trim();

    if (!oldName) {
      this.cancelRenameSelectedFolder();
      return;
    }

    await this.renameFolderOptimistic(oldName, newName);
    this.cancelRenameSelectedFolder();
  }

  private async renameFolderOptimistic(oldName: string, newName: string): Promise<void> {
    const normalizedOld = (oldName ?? '').trim();
    const normalizedNew = (newName ?? '').trim();

    if (!normalizedOld) {
      return;
    }

    if (!normalizedNew || normalizedOld === normalizedNew) {
      return;
    }

    const duplicate = this.folders.find((folder) => folder.name.toLowerCase() === normalizedNew.toLowerCase() && folder.name !== normalizedOld);
    if (duplicate) {
      const toast = await this.toastController.create({
        message: this.allTranslations?.folderAlreadyExists ?? 'Folder already exists',
        duration: 1800,
        position: 'bottom',
      });
      await toast.present();
      return;
    }

    const now = Date.now();
    const targetFolder = this.folders.find((folder) => folder.name === normalizedOld);
    if (!targetFolder) {
      return;
    }

    targetFolder.name = normalizedNew;
    targetFolder.last_modified = now;
    targetFolder.deleted = false;

    this.folders = [...this.folders].sort((a, b) => a.name.localeCompare(b.name));
    this.notes = this.notes.map((note: any) => {
      if ((note?.folder ?? '').trim() !== normalizedOld) {
        return note;
      }
      this.noteService.markPendingMutation(note.id, 'update', now);
      return { ...note, folder: normalizedNew, folder_id: this.normalizeFolderId(targetFolder.id), last_modified: now };
    });
    this.filteredResults = this.filteredResults.map((note: any) => {
      if ((note?.folder ?? '').trim() !== normalizedOld) {
        return note;
      }
      return { ...note, folder: normalizedNew, folder_id: this.normalizeFolderId(targetFolder.id), last_modified: now };
    });

    if (this.activeFolderName === normalizedOld) {
      this.activeFolderName = normalizedNew;
    }

    this.refreshVisibleNotes();
    this.cdr.detectChanges();

    void this.persistNotesState().catch(() => {});
    void this.persistFoldersState().catch(() => {});
  }

  public async promptRenameFolder(folder: Folder, slidingItem?: any): Promise<void> {
    const currentName = (folder?.name ?? '').trim();
    if (!currentName) {
      return;
    }

    await this.appHaptics.tap();

    const alert = await this.alertController.create({
      header: this.allTranslations?.renameFolder ?? 'Rename folder',
      inputs: [
        {
          name: 'name',
          type: 'text',
          value: currentName,
          placeholder: this.allTranslations?.folderName ?? 'Folder name',
        },
      ],
      buttons: [
        {
          text: this.allTranslations?.cancel ?? 'Cancel',
          role: 'cancel',
          handler: async () => {
            try { await slidingItem?.close?.(); } catch {}
          },
        },
        {
          text: this.allTranslations?.save ?? 'Save',
          handler: async (data) => {
            try { await slidingItem?.close?.(); } catch {}
            await this.renameFolderOptimistic(currentName, data?.name ?? '');
          },
        },
      ],
    });

    await alert.present();
  }

  private async persistFoldersState(): Promise<void> {
    const storedMap = new Map<string, Folder>();
    for (const folder of this.getStoredFolders(this.noteService.getNotesAppPassword())) {
      const key = this.normalizeFolderId(folder.id) ?? `name:${(folder.name ?? '').trim().toLowerCase()}`;
      storedMap.set(key, folder);
    }

    for (const folder of this.folders) {
      const normalizedName = (folder?.name ?? '').trim();
      if (!normalizedName) {
        continue;
      }
      const normalizedFolder: Folder = {
        id: this.normalizeFolderId(folder.id) ?? (crypto?.randomUUID?.() ?? String(Date.now() + Math.random())),
        name: normalizedName,
        last_modified: Number(folder?.last_modified ?? Date.now()),
        deleted: !!folder?.deleted,
      };
      storedMap.set(normalizedFolder.id as string, normalizedFolder);
    }

    const rawFolders = JSON.stringify(Array.from(storedMap.values()));
    if (this.noteService.appHasPasswordChallenge()) {
      const encryptedFolders = this.cryptoService.encrypt(rawFolders, this.noteService.getNotesAppPassword());
      this.noteService.setFolders(encryptedFolders);
    } else {
      this.noteService.setFolders(rawFolders);
    }
    await this.noteService.flushPersistence();
    await this.uploadFoldersState();
  }

  private upsertFolder(name: string): string {
    const normalizedName = (name ?? '').trim();
    if (!normalizedName) {
      return '';
    }

    const existing = this.folders.find((folder) => folder.name.toLowerCase() === normalizedName.toLowerCase());
    if (existing) {
      existing.deleted = false;
      existing.last_modified = Date.now();
      if (!existing.id) {
        existing.id = crypto?.randomUUID?.() ?? String(Date.now() + Math.random());
      }
      return existing.name;
    }

    const storedFolders = this.getStoredFolders(this.noteService.getNotesAppPassword());
    const deletedMatch = storedFolders.find((folder) => (folder.name ?? '').toLowerCase() == normalizedName.toLowerCase());
    if (deletedMatch) {
      deletedMatch.deleted = false;
      deletedMatch.last_modified = Date.now();
      this.folders = [...this.folders, deletedMatch].sort((a, b) => a.name.localeCompare(b.name));
      return deletedMatch.name;
    }

    this.folders = [...this.folders, { id: crypto?.randomUUID?.() ?? String(Date.now() + Math.random()), name: normalizedName, last_modified: Date.now(), deleted: false }]
      .sort((a, b) => a.name.localeCompare(b.name));
    return normalizedName;
  }


  public onFolderTouchStart(folderName: string): void {
    this.clearFolderPressTimer();
    this.folderPressTriggered = false;
    this.folderPressTimer = setTimeout(() => {
      this.folderPressTriggered = true;
      this.promptDeleteFolder(folderName).then(() => {});
    }, 550);
  }

  public onFolderTouchMove(): void {
    this.clearFolderPressTimer();
  }

  public onFolderTouchEnd(): void {
    const triggered = this.folderPressTriggered;
    this.clearFolderPressTimer();

    if (triggered) {
      setTimeout(() => {
        this.folderPressTriggered = false;
      }, 200);
    }
  }

  private clearFolderPressTimer(): void {
    if (this.folderPressTimer) {
      clearTimeout(this.folderPressTimer);
      this.folderPressTimer = null;
    }
  }

  public async promptDeleteFolder(folderName: string, slidingItem?: any): Promise<void> {
    this.clearFolderPressTimer();
    const normalizedFolder = (folderName ?? '').trim();
    if (!normalizedFolder) {
      return;
    }

    await this.appHaptics.tap();

    const noteCount = this.folderChipCount(normalizedFolder);
    const modal = await this.modalCtrl.create({
      component: DeleteFolderModalComponent,
      cssClass: 'confirmation-popup',
      componentProps: {
        folderName: normalizedFolder,
        noteCount,
      },
    });

    modal.onDidDismiss().then(async (data) => {
      try {
        await slidingItem?.close?.();
      } catch {}

      if (data?.data?.confirm) {
        await this.deleteFolderConfirm(normalizedFolder);
      }
    });

    await modal.present();
  }

  private async deleteFolderConfirm(folderName: string): Promise<void> {
    this.appHaptics.impactMedium();

    if (this.pendingDeletedIds.length > 0) {
      await this.commitPendingDelete();
    }

    const idsToDelete = new Set(
      this.notes
        .filter((note: any) => (note?.folder ?? '').trim() === folderName)
        .map((note: any) => note.id)
    );

    const now = Date.now();
    const deletedNotes = this.notes.filter((note: any) => idsToDelete.has(note.id));

    for (const note of deletedNotes) {
      this.noteService.markPendingMutation(note.id, 'delete', now);
    }

    const filteredResultsWasNotes = this.filteredResults === this.notes;
    this.notes = this.notes.filter((note: any) => !idsToDelete.has(note.id));
    this.filteredResults = filteredResultsWasNotes
      ? this.notes
      : this.filteredResults.filter((note: any) => !idsToDelete.has(note?.id));

    this.pendingDeletedNotes = deletedNotes;
    this.pendingDeletedIds = deletedNotes.map((note: any) => note.id);

    const deletedFolder = this.folders.find((folder) => folder.name === folderName);
    this.folders = this.folders.filter((folder) => folder.name !== folderName);

    const storedFolders = this.getStoredFolders(this.noteService.getNotesAppPassword()).filter((folder) => (folder.name ?? '').toLowerCase() !== folderName.toLowerCase());
    storedFolders.push({
      id: this.normalizeFolderId(deletedFolder?.id) ?? (crypto?.randomUUID?.() ?? String(Date.now() + Math.random())),
      name: folderName,
      last_modified: now,
      deleted: true,
    });

    const rawFolders = JSON.stringify(storedFolders);
    if (this.noteService.appHasPasswordChallenge()) {
      const encryptedFolders = this.cryptoService.encrypt(rawFolders, this.noteService.getNotesAppPassword());
      this.noteService.setFolders(encryptedFolders);
    } else {
      this.noteService.setFolders(rawFolders);
    }
    await this.noteService.flushPersistence();
    await this.uploadFoldersState();

    if (this.activeFolderName === folderName) {
      this.backToFolders();
    } else {
      this.refreshVisibleNotes();
    }

    const toast = await this.toastController.create({
      message: (this.allTranslations?.folderDeletedWithCount ?? 'Folder deleted with {{count}} notes').replace('{{count}}', String(deletedNotes.length)),
      duration: 4000,
      position: 'bottom',
      buttons: [
        {
          text: this.allTranslations?.undo ?? 'Undo',
          role: 'cancel',
          handler: () => {
            this.appHaptics.tap();
            this.restorePendingDeletedNotes();
            this.folders = [...this.folders, { id: deletedFolder?.id ?? (crypto?.randomUUID?.() ?? String(Date.now() + Math.random())), name: folderName, last_modified: now, deleted: false }]
              .sort((a, b) => a.name.localeCompare(b.name));
            this.persistFoldersState().then(() => {});
            this.refreshVisibleNotes();
          }
        }
      ]
    });

    toast.onDidDismiss().then(async (detail) => {
      if (detail.role !== 'cancel') {
        await this.commitPendingDelete();
      }
    });

    await toast.present();
  }

  public async promptCreateFolder(options?: { keepCurrentView?: boolean; onCreated?: (folderName: string) => Promise<void> | void }): Promise<void> {
    await this.appHaptics.tap();
    this.newFolderName = '';
    this.pendingCreateFolderOptions = options;
    this.newFolderModalOpen = true;

    await new Promise<boolean>((resolve) => {
      this.pendingCreateFolderResolver = resolve;
    });
  }

  public cancelCreateFolderModal(): void {
    this.newFolderModalOpen = false;
    this.newFolderName = '';
    this.pendingCreateFolderOptions = undefined;
    this.pendingCreateFolderResolver?.(false);
    this.pendingCreateFolderResolver = null;
  }

  public async confirmCreateFolderModal(): Promise<void> {
    const folderName = this.upsertFolder(this.newFolderName ?? '');
    if (!folderName) {
      return;
    }

    const options = this.pendingCreateFolderOptions;
    await this.persistFoldersState();

    this.newFolderModalOpen = false;
    this.newFolderName = '';
    this.pendingCreateFolderOptions = undefined;

    if (options?.onCreated) {
      await options.onCreated(folderName);
    } else {
      const toast = await this.toastController.create({
        message: this.allTranslations?.folderCreated ?? 'Folder created',
        duration: 1800,
        position: 'bottom',
      });
      await toast.present();
      if (!options?.keepCurrentView) {
        this.selectFolder(folderName);
      }
    }

    this.cdr.detectChanges();
    this.pendingCreateFolderResolver?.(true);
    this.pendingCreateFolderResolver = null;
  }

  public async moveSelectedNotesToFolder(): Promise<void> {
    if (!this.listOfCheckedCheckboxes?.length) {
      return;
    }

    await this.appHaptics.tap();

    const currentFolderName = (!this.folderBrowserMode && this.activeFolderName !== '__all__')
      ? this.activeFolderName
      : null;

    const inputs: any[] = [
      {
        label: this.allTranslations?.allNotes ?? 'All',
        type: 'radio',
        value: '__all__',
        checked: false,
      },
      ...this.folders
        .filter((folder) => !currentFolderName || folder.name !== currentFolderName)
        .map((folder) => ({
          label: folder.name,
          type: 'radio',
          value: folder.name,
          checked: false,
        })),
    ];

    const applyFolderMove = async (selectedFolder: string): Promise<void> => {
      const targetFolder = selectedFolder === '__all__' ? '' : this.upsertFolder(selectedFolder ?? '');
      const targetFolderId = targetFolder ? this.resolveFolderIdByName(targetFolder) : null;
      const selectedIds = new Set(this.listOfCheckedCheckboxes);
      const movedCount = selectedIds.size;
      const now = Date.now();

      this.notes = this.notes.map((note: any) => {
        if (!selectedIds.has(note.id)) {
          return note;
        }
        this.noteService.markPendingMutation(note.id, 'update', now);
        return { ...note, folder: targetFolder, folder_id: targetFolderId, last_modified: now };
      });

      this.filteredResults = this.search_query.length > 0 ? this.filteredResults.map((note: any) => {
        if (!selectedIds.has(note.id)) {
          return note;
        }
        return { ...note, folder: targetFolder, folder_id: targetFolderId, last_modified: now };
      }) : this.notes;

      await this.persistNotesState();
      await this.persistFoldersState();
      this.refreshVisibleNotes();

      if (this.checkboxOpened) {
        this.listOfCheckedCheckboxes = [];
        await this.toggleCheckbox();
      }

      const toast = await this.toastController.create({
        message: movedCount === 1
          ? (this.allTranslations?.noteMovedToFolder ?? 'Note moved')
          : (this.allTranslations?.notesMovedToFolder ?? '{{count}} notes moved').replace('{{count}}', String(movedCount)),
        duration: 2200,
        position: 'bottom',
      });
      await toast.present();
    };

    const alert = await this.alertController.create({
      header: this.allTranslations?.moveToFolder ?? 'Move to folder',
      inputs,
      buttons: [
        { text: this.allTranslations?.cancel ?? 'Cancel', role: 'cancel' },
        {
          text: this.allTranslations?.newFolder ?? 'New folder',
          handler: async () => {
            await alert.dismiss();
            setTimeout(() => {
              this.promptCreateFolder({
                keepCurrentView: true,
                onCreated: async (folderName: string) => {
                  await this.applyNewFolderMoveSelection(folderName);
                }
              }).then(() => {});
            }, 50);
            return false;
          },
        },
        {
          text: this.allTranslations?.move ?? 'Move',
          handler: async (selectedFolder: string) => {
            await applyFolderMove(selectedFolder);
            return true;
          },
        },
      ],
    });

    await alert.present();
  }

  private async applyNewFolderMoveSelection(folderName: string): Promise<void> {
    await this.appHaptics.tap();
    const targetFolder = this.upsertFolder(folderName);
    const targetFolderId = targetFolder ? this.resolveFolderIdByName(targetFolder) : null;
    if (!targetFolder) {
      return;
    }

    const selectedIds = new Set(this.listOfCheckedCheckboxes);
    const movedCount = selectedIds.size;
    const now = Date.now();

    this.notes = this.notes.map((note: any) => {
      if (!selectedIds.has(note.id)) {
        return note;
      }
      this.noteService.markPendingMutation(note.id, 'update', now);
      return { ...note, folder: targetFolder, folder_id: targetFolderId, last_modified: now };
    });

    this.filteredResults = this.search_query.length > 0 ? this.filteredResults.map((note: any) => {
      if (!selectedIds.has(note.id)) {
        return note;
      }
      return { ...note, folder: targetFolder, folder_id: targetFolderId, last_modified: now };
    }) : this.notes;

    await this.persistNotesState();
    await this.persistFoldersState();
    this.refreshVisibleNotes();

    if (this.checkboxOpened) {
      this.listOfCheckedCheckboxes = [];
      await this.toggleCheckbox();
    }

    const toast = await this.toastController.create({
      message: movedCount === 1
        ? (this.allTranslations?.noteMovedToFolder ?? 'Note moved')
        : (this.allTranslations?.notesMovedToFolder ?? '{{count}} notes moved').replace('{{count}}', String(movedCount)),
      duration: 2200,
      position: 'bottom',
    });
    await toast.present();
  }

  public settings() {
    this.navController.navigateForward('app-settings').then(r => {});
  }

  goToProfile() {
    this.navController.navigateForward('profile').then(r => {});
  }

  public openOrCheckbox(note_id: string) {
    if (!this.checkboxOpened) {
      this.appHaptics.tap();
      this.navController.navigateForward('/note/' + note_id).then(r => {});
    }
  }

  public async deleteSelectedNotes() {
    await this.appHaptics.tap();

    const modal = await this.modalCtrl.create({
      component: DeleteNoteModalComponent,
      cssClass: 'confirmation-popup',
      componentProps: {
        isSingleDelete: this.listOfCheckedCheckboxes?.length == 1 || false,
      }
    });

    modal.onDidDismiss().then(async (data) => {
      if (data && data.data) {
        const { confirm } = data.data;
        if (confirm) {
          await this.deleteNotesConfirm();
        }
      }
    });

    return await modal.present();
  }

  private async deleteNotesConfirm() {
    this.appHaptics.impactMedium();

    if (!this.listOfCheckedCheckboxes?.length) {
      await this.toggleCheckbox();
      return;
    }

    if (this.pendingDeletedIds.length > 0) {
      await this.commitPendingDelete();
    }

    const idsToDelete = new Set(this.listOfCheckedCheckboxes);
    const deletedNotes = this.notes.filter((note: any) => idsToDelete.has(note.id));

    for (const note of deletedNotes) {
      this.noteService.markPendingMutation(note.id, 'delete', Date.now());
    }

    for (let j = this.notes.length - 1; j >= 0; j--) {
      if (idsToDelete.has(this.notes[j].id)) {
        this.notes.splice(j, 1);
      }
    }

    if (this.filteredResults !== this.notes) {
      for (let k = this.filteredResults.length - 1; k >= 0; k--) {
        const n = this.filteredResults[k];
        if (n && idsToDelete.has(n.id)) {
          this.filteredResults.splice(k, 1);
        }
      }
    } else {
      this.filteredResults = this.notes;
    }

    this.pendingDeletedNotes = deletedNotes;
    this.pendingDeletedIds = deletedNotes.map((note: any) => note.id);

    this.refreshVisibleNotes();

    const deletedCount = deletedNotes.length;
    const toast = await this.toastController.create({
      message: deletedCount === 1
        ? (this.allTranslations?.noteDeleted ?? 'Note deleted')
        : (this.allTranslations?.notesDeletedWithCount ?? '{{count}} notes deleted').replace('{{count}}', String(deletedCount)),
      duration: 4000,
      position: 'bottom',
      buttons: [
        {
          text: this.allTranslations?.undo ?? 'Undo',
          role: 'cancel',
          handler: () => {
            this.appHaptics.tap();
            this.restorePendingDeletedNotes();
          },
        },
      ],
    });

    toast.onDidDismiss().then(async (result) => {
      if (result.role === 'cancel') {
        return;
      }

      await this.commitPendingDelete();
    });

    this.listOfCheckedCheckboxes = [];
    await this.toggleCheckbox();
    await toast.present();
  }

  public async resetPassword() {
    await this.appHaptics.warning();

    const modal = await this.modalCtrl.create({
      component: ResetPassModalComponent,
      cssClass: 'confirmation-popup'
    });

    modal.onDidDismiss().then(async (data) => {
      if (data && data.data) {
        const { confirm } = data.data;
        if (confirm) {
          this.noteService.clearSensitiveRuntimeState();
          this.input_password_app_unlock = '';
          this.should_display = true;

          await this.dataService.clearAppData();

          window.location.reload();
        }
      }
    });

    return await modal.present();
  }

  public selectNote(event: any, note_id: string) {
    this.appHaptics.selectionChanged();
    event?.stopImmediatePropagation();
    event?.preventDefault();

    if (this.isClicked) return;

    this.isClicked = true;

    if (!this.listOfCheckedCheckboxes.includes(note_id)) {
      this.listOfCheckedCheckboxes.push(note_id);
    } else {
      for (let i = 0; this.listOfCheckedCheckboxes.length > i; i++) {
        if (this.listOfCheckedCheckboxes[i] == note_id) {
          this.listOfCheckedCheckboxes.splice(i, 1);
        }
      }
    }

    setTimeout(() => {
      this.isClicked = false;
      this.cdr.detectChanges();
    });
  }

  public ionInputAppUnlockInput(ev: any) {
    if (ev.key == "Enter") {
      this.unlockNotesApp().then(r => {});
    }
  }
}
