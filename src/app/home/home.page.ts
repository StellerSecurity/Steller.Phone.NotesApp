import { ChangeDetectorRef, Component, ElementRef, QueryList, ViewChild, ViewChildren } from '@angular/core';
import {
  GestureController,
  IonModal,
  IonSearchbar,
  ModalController,
  NavController,
  ToastController,
} from '@ionic/angular';

import { CryptoService } from "../services/crypto.service";
import { NotesService } from "../services/notes.service";
import { AppProtectorService } from "../services/app-protector.service";
import { DeleteNoteModalComponent } from '../delete-note-modal/delete-note-modal.component';
import { ResetPassModalComponent } from '../restpass-modal/resetpass-modal.component';
import { TranslatorService } from '../services/translator.service';
import { Haptics } from "@capacitor/haptics";
import { NotesApiV1Service } from "../services/notes-api-v1.service";
import { CryptoKeyService, unpackCipherBlob } from "../services/crypto-key.service";
import { SecureStorageService } from "../services/secure-storage.service";
import { ActivatedRoute, Router } from "@angular/router";
import { DataService } from "../services/data.service";
import {normalize} from "../utils/home-normalize.util";
import {initializePressGestures, LongPressConfig} from "../utils/home-gesture.util";
import {setDecryptedNotesAndParse} from "../utils/home-notes.util";

// NEW helpers

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage {
  // --------------------------------------------------
  // Constants
  // --------------------------------------------------
  private static readonly LONG_PRESS_DELAY_MS = 200;          // long-press trigger time
  private static readonly LONG_PRESS_START_DELAY_MS = 100;    // initial delay before opening checkbox mode
  private static readonly MOVE_TOLERANCE_PX = 15;             // movement tolerance during press
  private static readonly SEARCH_FOCUS_DELAY_MS = 100;
  private static readonly DETECT_CHANGES_DELAY_MS = 200;
  private static readonly RESYNC_INTERVAL_MS = 30_000;

  // --------------------------------------------------
  // View Refs
  // --------------------------------------------------
  @ViewChild(IonModal) modal: IonModal;
  @ViewChild('searchbar') searchbar: IonSearchbar;
  @ViewChildren('longPressElements', { read: ElementRef }) longPressElements: QueryList<ElementRef>;

  // --------------------------------------------------
  // State
  // --------------------------------------------------
  private notes: any;
  private pauseSync = false;
  private hiddenId: string | null = null;

  public should_display = true;
  public checkboxOpened = false;
  public listOfCheckedCheckboxes: string[] = [];
  public showPassword = false;
  public input_password_app_unlock = "";
  public timezone = "UTC";
  public search_query = "";
  public filteredResults: any = [];
  public isSearching = false;
  public isSyncing = false;
  public waitForSync = false;
  public searchMode = false;

  timeout: any;
  isClicked: boolean = false;

  allTranslations: any;

  constructor(
    private cryptoService: CryptoService,
    private noteService: NotesService,
    private navController: NavController,
    private toastController: ToastController,
    private appProtectorService: AppProtectorService,
    private modalCtrl: ModalController,
    private route: ActivatedRoute,
    private dataService: DataService,
    private notesApiServiceV1: NotesApiV1Service,
    private translatorService: TranslatorService,
    private gestureCtrl: GestureController,
    private crypto: CryptoKeyService,
    private router: Router,
    private secureStorageService: SecureStorageService,
    private cdr: ChangeDetectorRef
  ) {}

  // --------------------------------------------------
  // Lifecycle
  // --------------------------------------------------
  async ionViewWillEnter() {
    if (this.pauseSync) this.pauseSync = false;

    this.hiddenId = this.route.snapshot.queryParamMap.get('hide_ids');

    if (this.dataService.getForceDownloadOnHome()) {
      this.waitForSync = true;
    }

    if (!this.noteService.appHasPasswordChallenge()) {
      const eakB64 = await this.secureStorageService.getItem('ssEakB64');
      if (eakB64) {
        await this.crypto.importEAK(eakB64);
      }
    }

    this.allTranslations = this.translatorService.allTranslations;
    this.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (this.noteService.shouldAskForPassword()) {
      console.log("Asking for password");
      this.should_display = false;
    } else {
      console.log("Asking for password or no password needed.");
      this.setData(this.noteService.getNotesAppPassword());
      await this.syncFromServer();
    }

    this.checkboxOpened = false;
    this.initializePressGesture();
  }

  ionViewDidEnter() {
    this.initializePressGesture();
  }

  ionViewWillLeave() {
    this.exitSearchMode();
    this.pauseSync = true;
    // cleanup if needed
  }

  // --------------------------------------------------
  // UI Modes: Search & Checkbox
  // --------------------------------------------------
  enterSearchMode() {
    this.searchMode = true;
    setTimeout(() => {
      this.searchbar?.setFocus();
    }, HomePage.SEARCH_FOCUS_DELAY_MS);
  }

  exitSearchMode() {
    this.search_query = '';
    this.pauseSync = false;
    this.search();
    this.initializePressGesture();
    setTimeout(() => {
      this.searchMode = false;
      this.cdr.detectChanges();
    }, HomePage.DETECT_CHANGES_DELAY_MS);
  }

  public toggleCheckbox() {
    this.checkboxOpened = !this.checkboxOpened;
    if (!this.checkboxOpened) {
      this.listOfCheckedCheckboxes = [];
      this.pauseSync = false;
    } else {
      this.pauseSync = true;
    }
    this.initializePressGesture();
    setTimeout(() => this.cdr.detectChanges(), HomePage.DETECT_CHANGES_DELAY_MS);
  }

  // --------------------------------------------------
  // Search
  // --------------------------------------------------
  search() {
    if (this.search_query.length == 0) {
      this.isSearching = false;
      this.filteredResults = this.notes;
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

      // dont search in locked notes.
      if (result && !this.notes[i].protected) {
        filteredNewResults.push(this.notes[i]);
      } else if (titleExists) {
        filteredNewResults.push(this.notes[i]);
      }
    }

    this.isSearching = true;
    this.pauseSync = true;
    this.filteredResults = filteredNewResults;

    this.initializePressGesture();
    setTimeout(() => this.cdr.detectChanges(), HomePage.DETECT_CHANGES_DELAY_MS);
  }

  // --------------------------------------------------
  // Long-press selection (delegates to util)
  // --------------------------------------------------
  initializePressGesture(): void {
    const cfg: LongPressConfig = {
      delayMs: HomePage.LONG_PRESS_DELAY_MS,
      moveTolerancePx: HomePage.MOVE_TOLERANCE_PX,
      startDelayMs: HomePage.LONG_PRESS_START_DELAY_MS,
    };

    initializePressGestures(
      this.longPressElements,
      this.gestureCtrl,
      (nativeEl) => this.handlePressStart(nativeEl),
      () => this.handlePressEnd(),
      cfg
    );
  }

  handlePressStart(element: any) {
    this.timeout = setTimeout(() => {
      this.checkboxOpened = true;
      setTimeout(() => {
        this.cdr.detectChanges();
        const noteId = element.id;

        // ✅ If not already selected, check it
        if (!this.listOfCheckedCheckboxes.includes(noteId)) {
          const checkboxEle = element.children[0].children[0];
          checkboxEle.checked = true;
          this.listOfCheckedCheckboxes.push(noteId);
        }

        Haptics.vibrate({ duration: 50 }).then(() => {});
        setTimeout(() => this.cdr.detectChanges(), HomePage.DETECT_CHANGES_DELAY_MS);
      }, HomePage.LONG_PRESS_START_DELAY_MS);
    }, HomePage.LONG_PRESS_START_DELAY_MS);
  }

  handlePressEnd() {
    clearTimeout(this.timeout);
  }

  // --------------------------------------------------
  // Data loading / syncing
  // --------------------------------------------------
  private setData(password: string = ""): boolean {
    const { parsed } = setDecryptedNotesAndParse(this.noteService, this.cryptoService, password);
    if (!parsed && this.noteService.appHasPasswordChallenge()) {
      return false;
    }
    // @ts-ignore
    this.notes = parsed ?? [];
    this.filteredResults = this.notes;
    return true;
  }

  async syncFromServer() {
    const user = await this.secureStorageService.getItem('ssUser');
    if (user == null) return;

    if (this.pauseSync) {
      console.log('Sync has paused.');
      return;
    }
    console.log('Sync has started');
    setTimeout(() => { this.syncFromServer(); }, 30_000);

    this.isSyncing = true;
    try {
      const res = await this.notesApiServiceV1.download(0);

      const serverNotes = res?.notes ?? [];
      const map = new Map<string, any>((this.notes ?? []).map((n: any) => [n.id, n]));

      for (const s of serverNotes) {
        const local = map.get(s.id);

        if (this.hiddenId === s.id) {
          map.delete(s.id);
          continue;
        }

        if (s.deleted) {
          if (!local || (s.last_modified ?? 0) >= (local?.last_modified ?? 0)) map.delete(s.id);
          continue;
        }

        // Decrypt text (required)
        const blobText = unpackCipherBlob(s.text);
        s.text = await this.crypto.decryptText({ ...blobText, v: 1, aad_b64: btoa(s.id) });

        // Decrypt title ONLY if present; otherwise set to empty string
        if (typeof s.title === 'string' && s.title.length > 0) {
          const blobTitle = unpackCipherBlob(s.title);
          s.title = await this.crypto.decryptText({ ...blobTitle, v: 1, aad_b64: btoa(s.id + '#title') });
        } else {
          s.title = '';
        }

        if (!local) { map.set(s.id, s); continue; }
        if ((s.last_modified ?? 0) >= (local.last_modified ?? 0)) map.set(s.id, { ...local, ...s });
      }

      const merged = Array.from(map.values()).filter((n: any) => !n.deleted);
      this.notes = merged;
      this.filteredResults = merged;
      this.isSyncing = false;

      if (this.noteService.appHasPasswordChallenge()) {
        const encryptedNotesSave = this.cryptoService.encrypt(JSON.stringify(merged), this.noteService.getNotesAppPassword());
        this.noteService.setNotes(encryptedNotesSave);
      } else {
        this.noteService.setNotes(JSON.stringify(merged));
      }

      this.setData(this.noteService.getNotesAppPassword());
      this.waitForSync = false;
      this.dataService.setForceDownloadOnHome(false);

      console.log('Synching in 30 seconds...');
    } catch (err) {
      console.error('Sync failed:', err);
      this.isSyncing = false;
    }
  }


  // --------------------------------------------------
  // Auth / Protection
  // --------------------------------------------------
  public togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  // @ts-ignore
  public async unlockNotesApp() {
    if (this.input_password_app_unlock.length == 0) {
      const toast = await this.toastController.create({
        message: "Please enter your password.",
        duration: 3000,
        position: 'bottom',
      });
      await toast.present();
      return;
    }

    try {
      this.should_display = true;

      this.noteService.setNotesAppPassword(this.input_password_app_unlock);
      this.setData(this.input_password_app_unlock);

      let eakB64 = await this.secureStorageService.getItem('ssEakB64_Encrypted');
      if (eakB64) {
        // @ts-ignore
        eakB64 = this.cryptoService.decrypt(eakB64, this.input_password_app_unlock);
        // @ts-ignore
        await this.crypto.importEAK(eakB64);
      }

      // init protection
      this.appProtectorService.init();

      this.input_password_app_unlock = "";

      this.syncFromServer().then(() => {});

      setTimeout(() => {
        this.initializePressGesture();
        this.cdr.detectChanges();
      }, HomePage.DETECT_CHANGES_DELAY_MS);

      return;

    } catch (e: any) {
      console.error(e);
      const toast = await this.toastController.create({
        message: this.allTranslations.passwordIsNotCorrectTryAgain,
        duration: 3000,
        position: 'bottom',
      });

      this.should_display = false;
      this.input_password_app_unlock = "";

      await toast.present();
      return;
    }
  }

  // --------------------------------------------------
  // Notes helpers
  // --------------------------------------------------
  /**
   * Will get the decrypted notes (if there is any), and sort them by last modified.
   */
  getNotes() {
    if (this.filteredResults === undefined || this.filteredResults === null) {
      return [];
    }
    // @ts-ignore
    this.filteredResults = this.filteredResults.sort((a, b) => b.last_modified - a.last_modified);
    return this.filteredResults;
  }

  public settings() {
    this.navController.navigateForward('app-settings').then(r => {});
  }

  goToProfile() {
    this.navController.navigateForward('profile').then(r => {});
  }

  public openOrCheckbox(note_id: string) {
    if (!this.checkboxOpened) {
      this.navController.navigateForward('/note/' + note_id).then(r => {});
    }
  }

  public async deleteSelectedNotes() {
    // @ts-ignore
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

  /**
   * Being called, when the confirmation has been done.
   * @private
   */
  /**
   * Being called, when the confirmation has been done.
   * @private
   */
  private async deleteNotesConfirm() {
    // Nothing selected? Nothing to do.
    if (!this.listOfCheckedCheckboxes?.length) {
      this.toggleCheckbox();
      return;
    }

    const idsToDelete = new Set(this.listOfCheckedCheckboxes);

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
    }

    if (this.noteService.appHasPasswordChallenge()) {
      const encryptedNotesSave = this.cryptoService.encrypt(
        JSON.stringify(this.notes),
        this.noteService.getNotesAppPassword()
      );
      localStorage.setItem('app_password_challenge', '1');
      this.noteService.setNotes(encryptedNotesSave);
    } else {
      this.noteService.setNotes(JSON.stringify(this.notes));
    }

    this.noteService.setDecryptedNotes(this.noteService.getNotes());

    // 5) Server-side delete (if signed in)
    const user = await this.secureStorageService.getItem('ssUser');
    if (user) {
        await this.notesApiServiceV1.deleteNotes(this.listOfCheckedCheckboxes).then((data) => {});
    }

    this.listOfCheckedCheckboxes = [];
    this.toggleCheckbox();
  }


  public async resetPassword() {
    // @ts-ignore
    const modal = await this.modalCtrl.create({
      component: ResetPassModalComponent,
      cssClass: 'confirmation-popup'
    });

    modal.onDidDismiss().then(async (data) => {
      if (data && data.data) {
        const {confirm} = data.data;
        if (confirm) {
          this.dataService.clearAppData();
          window.location.href = '/'; // keep original behavior
        }
      }
    });

    return await modal.present();

  }

  /**
   * Selecting notes that the user has chosen in UI.
   * @param event
   * @param note_id
   */
  public selectNote(event: any, note_id: string) {
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

  /**
   * Will detect if the user presses enter on unlock notes-app.
   * @param ev
   */
  public ionInputAppUnlockInput(ev: any) {
    if (ev.key == "Enter") {
      this.unlockNotesApp().then(r => {});
    }
  }
}
