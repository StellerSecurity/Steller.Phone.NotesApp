import {ChangeDetectorRef, Component, ElementRef, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {
    AlertController, GestureController, IonModal,
    IonSearchbar,
    LoadingController,
    ModalController,
    NavController,
    Platform,
    ToastController,
} from '@ionic/angular';

import {CryptoService} from "../services/crypto.service";
import {NotesService} from "../services/notes.service";
import {AppProtectorService} from "../services/app-protector.service";
import { DeleteNoteModalComponent } from '../delete-note-modal/delete-note-modal.component';
import { ResetPassModalComponent } from '../restpass-modal/resetpass-modal.component';
import { TranslatorService } from '../services/translator.service';
import {search} from "ionicons/icons";
import {Haptics, ImpactStyle} from "@capacitor/haptics";
import {NotesApiV1Service} from "../services/notes-api-v1.service";

@Component({
    selector: 'app-home',
    templateUrl: 'home.page.html',
    styleUrls: ['home.page.scss'],
})
export class HomePage {
    private notes: any;

    public should_display = true;

    public checkboxOpened = false;

    public listOfCheckedCheckboxes: string[] = [];

    public app_requires_password = false;
    public showPassword = false;

    public input_password_app_unlock = "";

    public timezone = "UTC";

    public search_query = "";

    public filteredResults : any = [];

    public isSearching = false;

    public isSyncing = false;

    allTranslations:any;

    @ViewChild(IonModal) modal: IonModal;
    @ViewChildren('longPressElements', { read: ElementRef }) longPressElements: QueryList<ElementRef>;
    timeout: any;
    isClicked: boolean = false;
    searchMode = false;

    @ViewChild('searchbar') searchbar: IonSearchbar;

    constructor(private cryptoService: CryptoService,
                private noteService: NotesService,
                private navController: NavController,
                private toastController: ToastController,
                private appProtectorService: AppProtectorService,
                private modalCtrl: ModalController,
                private notesApiServiceV1: NotesApiV1Service,
                private translatorService: TranslatorService,
                private gestureCtrl: GestureController,
                private cdr: ChangeDetectorRef) {}

    ionViewWillEnter() {
        this.allTranslations = this.translatorService.allTranslations;
        this.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if(this.noteService.shouldAskForPassword()) {
            this.should_display = false;
        } else {
            this.setData(this.noteService.getNotesAppPassword()); // will send a password, if the app is encrypted.
        }

        this.checkboxOpened = false;
        this.initializePressGesture();
    }

    enterSearchMode() {
        this.searchMode = true;
        setTimeout(() => {
            this.searchbar?.setFocus();
        }, 100); // Delay to ensure DOM renders
    }

    exitSearchMode() {
        this.search_query = '';
        this.search();
        this.initializePressGesture();
        setTimeout(() => {
            this.searchMode = false;
            this.cdr.detectChanges();
        }, 200)
    }


    search() {

        if(this.search_query.length == 0) {
            this.isSearching = false;
            this.filteredResults = this.notes;
            return;
        }

        let filteredNewResults = [];

        // helper: normalize / decode / map to stable searchable form
        const normalize = (input: any) => {
            if (input === null || input === undefined) return '';
            let s = String(input);

            // 1) decode HTML entities if stored that way (safe in browser)
            try {
                const ta = document.createElement('textarea');
                ta.innerHTML = s;
                s = ta.value;
            } catch (e) {
                // ignore if document not available (SSR); keep raw string
            }

            // 2) compatibility normalization + lowercase
            if (s.normalize) s = s.normalize('NFKC');
            s = s.toLowerCase();

            // 3) remove invisible/zero-width chars
            s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');

            // 4) decompose and remove combining diacritics (so á -> a)
            if (s.normalize) s = s.normalize('NFD');
            s = s.replace(/[\u0300-\u036f]/g, '');
            if (s.normalize) s = s.normalize('NFC');

            // 5) map common ligatures / special letters to ASCII-ish equivalents
            //    (helps when user types 'ae' vs stored 'æ', or to normalize visible differences)
            s = s.replace(/æ/g, 'ae')
                .replace(/œ/g, 'oe')
                .replace(/ø/g, 'o')
                .replace(/å/g, 'a')
                .replace(/ß/g, 'ss');

            // 6) collapse whitespace
            s = s.replace(/\s+/g, ' ').trim();

            return s;
        };

        const normalizedQuery = normalize(this.search_query);

        for(let i = 0; this.notes.length > i; i++) {
            // make safe even if text/title are null/objects
            const normalizedText = normalize(this.notes[i]?.text);
            const result = normalizedText.includes(normalizedQuery);

            let titleExists = false;

            if(this.notes[i].title !== undefined) {
                const normalizedTitle = normalize(this.notes[i]?.title);
                titleExists = normalizedTitle.includes(normalizedQuery);
            }

            // dont search in locked notes.
            if(result && !this.notes[i].protected) {
                filteredNewResults.push(this.notes[i]);
            } else if(titleExists) {
                filteredNewResults.push(this.notes[i]);
            }

        }

        this.isSearching = true;
        this.filteredResults = filteredNewResults;

        this.initializePressGesture();

        setTimeout(() => {
            this.cdr.detectChanges();
        }, 200)

    }

    ionViewDidEnter() {
        this.initializePressGesture();
        window.addEventListener('online', () => { this.syncFromServer() });
    }

    initializePressGesture(): void {
        // if (this.platform.is('mobile') || this.platform.is('android') || this.platform.is('ios')) {
        this.longPressElements.forEach((elementRef: ElementRef) => {
            this.createLongPressGesture(elementRef);
        });
        // }
    }

    createLongPressGesture(element: ElementRef) {
        let timeout: any;
        let isLongPress = false;
        let startX = 0;
        let startY = 0;

        const gesture = this.gestureCtrl.create({
            el: element.nativeElement,
            threshold: 0,
            gestureName: 'long-press',

            onStart: (detail) => {
                startX = detail.currentX;
                startY = detail.currentY;

                timeout = setTimeout(() => {
                    isLongPress = true;
                    this.handlePressStart(element.nativeElement);
                }, 200); // Faster long-press detection (200ms)
            },

            onMove: (detail) => {
                const moveX = Math.abs(detail.currentX - startX);
                const moveY = Math.abs(detail.currentY - startY);

                // Allow slight movements (15px tolerance) before canceling long press
                if (moveX > 15 || moveY > 15) {
                    clearTimeout(timeout);
                }
            },

            onEnd: () => {
                clearTimeout(timeout);
                if (isLongPress) {
                    this.handlePressEnd();
                }
                isLongPress = false;
            },
        });

        gesture.enable();
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
                setTimeout(() => {
                    this.cdr.detectChanges();
                }, 200);
            }, 100);
        }, 100);
    }

    handlePressEnd() {
        clearTimeout(this.timeout);
    }

    private setData(password: string = ""): boolean {

        let decryptedNotes = null;
        if(this.noteService.appHasPasswordChallenge()) {
            let notes = this.noteService.getNotes();
            decryptedNotes = this.cryptoService.decrypt(notes, password);
        } else {
            this.noteService.setDecryptedNotes(this.noteService.getNotes());
            decryptedNotes = this.noteService.getNotes();
        }

        // @ts-ignore
        if(decryptedNotes?.length == 0 && this.noteService.appHasPasswordChallenge()) {
            return false;
        }

        this.noteService.setDecryptedNotes(decryptedNotes);
        // @ts-ignore
        this.notes = JSON.parse(decryptedNotes);

        this.filteredResults = this.notes;

        this.syncFromServer();
        return true;

    }

    private syncFromServer() {
        this.isSyncing = true;
        this.notesApiServiceV1.download(0).subscribe({
            next: ({ notes, watermark }) => {
                // ignore any tombstones from server
                const keep = notes.filter(n => !n.deleted);
                this.notes = keep;
                this.filteredResults = this.notes;
                this.isSyncing = false;
                this.noteService.setNotes(JSON.stringify(keep));
            },
            error: (err) => {
                this.isSyncing = false;
                console.error('download failed', err)
            },
        });

        setTimeout(() => { this.syncFromServer(); }, 30_000);
        console.log('Synching in 30 seconds...');
    }

    public togglePasswordVisibility() {
        this.showPassword = !this.showPassword;
    }

    // @ts-ignore
    public async unlockNotesApp() {

        if(this.input_password_app_unlock.length == 0) {

            const toast = await this.toastController.create({
                message: "Please enter your password.",
                duration: 3000,
                position: 'bottom',
            });

            await toast.present();

            return;
        }

        this.noteService.increaseAppNoteAttemptsFailedPasswords();
        if (this.noteService.shouldWipeAllNotesOrNot()) {
            localStorage.clear();
            // @ts-ignore
            navigator['app'].exitApp();
            return false;
        }

        let shouldUnlock = false;

        try {
            shouldUnlock = this.setData(this.input_password_app_unlock);
        } catch (e) {
            //console.error(e);
        }

        if(shouldUnlock) {
            this.should_display = true;
            // init protection
            this.appProtectorService.init();
            // store the notes app password in a service.
            this.noteService.setNotesAppPassword(this.input_password_app_unlock);
            // reset failed attempts.
            this.noteService.setFailedPasswordAppAttempts(0);

            this.input_password_app_unlock = "";
            setTimeout(() => {
                this.initializePressGesture();
                this.cdr.detectChanges();
            }, 200)
        } else {
            const toast = await this.toastController.create({
                message: this.allTranslations.passwordIsNotCorrectTryAgain,
                duration: 3000,
                position: 'bottom',
            });

            this.input_password_app_unlock = "";

            await toast.present();
            return false;
        }

        return true;
    }

    /**
     * Will get the decrypted notes (if there is any),
     * and sort them by last modified.
     */
    getNotes()  {
        if(this.filteredResults === undefined || this.filteredResults === null) {
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
        if(!this.checkboxOpened) {
            this.navController.navigateForward('/note/' + note_id).then(r => {});
        }
    }

    public toggleCheckbox() {
        this.checkboxOpened = !this.checkboxOpened;
        if(!this.checkboxOpened) {
            this.listOfCheckedCheckboxes = [];
        }
        this.initializePressGesture();
        setTimeout(() => {
            this.cdr.detectChanges();
        }, 200)
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
    private async deleteNotesConfirm() {

        // delete the selected notes.
        for (let i = 0; this.listOfCheckedCheckboxes.length > i; i++) {
            for (let j = this.notes.length - 1; j >= 0; j--) {
                if (this.listOfCheckedCheckboxes[i] == this.notes[j].id) {
                    this.notes.splice(j, 1);
                }
            }
        }

        if (this.noteService.appHasPasswordChallenge()) {
            // newly notes to save into storage.
            let encryptedNotesSave = this.cryptoService.encrypt(JSON.stringify(this.notes), this.noteService.getNotesAppPassword());
            // notes in the app is stored.
            localStorage.setItem("app_password_challenge", "1");
            // update notes, and store.
            this.noteService.setNotes(encryptedNotesSave);
        } else {
            this.noteService.setNotes(JSON.stringify(this.notes));
        }

        this.noteService.setDecryptedNotes(this.noteService.getNotes());
        this.notesApiServiceV1.deleteNotes(this.listOfCheckedCheckboxes);

        this.listOfCheckedCheckboxes = [];
        this.toggleCheckbox();
        //this.setData(this.input_password_app_unlock);

    }

    public async resetPassword() {

        // @ts-ignore
        const modal = await this.modalCtrl.create({
            component: ResetPassModalComponent,
            cssClass: 'confirmation-popup'
        });

        modal.onDidDismiss().then(async (data) => {
            if (data && data.data) {
                const { confirm } = data.data;
                if (confirm) {
                    localStorage.clear();
                    this.app_requires_password = false;
                    window.location.href='/';
                } else {
                    // Handle case when user cancels password input
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

        if (this.isClicked) {
            return;
        }

        this.isClicked = true;

        if(!this.listOfCheckedCheckboxes.includes(note_id)) {
            this.listOfCheckedCheckboxes.push(note_id);
        } else { // removed.
            for(let i = 0; this.listOfCheckedCheckboxes.length > i; i++) {
                if(this.listOfCheckedCheckboxes[i] == note_id) {
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
        if(ev.key == "Enter") {
            this.unlockNotesApp().then(r => {});
        }
    }

    ionViewWillLeave() {
        this.exitSearchMode();
        // Perform cleanup, stop timers, dismiss modals, etc.
    }

}
