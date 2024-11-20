import {ChangeDetectorRef, Component, ElementRef, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {
  AlertController, GestureController, IonModal,
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
  allTranslations:any;

  @ViewChild(IonModal) modal: IonModal;
  @ViewChildren('longPressElements', { read: ElementRef }) longPressElements: QueryList<ElementRef>;
  timeout: any;
  isClicked: boolean = false;

  constructor(private cryptoService: CryptoService,
              private alertCtrl: AlertController,
              private noteService: NotesService,
              private navController: NavController,
              private toastController: ToastController,
              private appProtectorService: AppProtectorService,
              private modalCtrl: ModalController,
              private loadingController: LoadingController,
              private translatorService: TranslatorService,
              private gestureCtrl: GestureController,
              private platform: Platform,
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

  ionViewDidEnter() {
    this.initializePressGesture();
  }

  initializePressGesture(): void {
    if (this.platform.is('mobile') || this.platform.is('android') || this.platform.is('ios')) {
      this.longPressElements.forEach((elementRef: ElementRef) => {
        this.createLongPressGesture(elementRef);
      });
    } 
  }

  createLongPressGesture(element: ElementRef) {
    const gesture = this.gestureCtrl.create({
      el: element.nativeElement,
      threshold: 0,
      gestureName: 'long-press',
      onStart: () => {
        this.handlePressStart(element.nativeElement);
      },
      onEnd: () => {
        this.handlePressEnd()
      },
    });
    gesture.enable();
  }

  handlePressStart(element:any) {
    this.timeout = setTimeout(() => {
      this.checkboxOpened = true;
      setTimeout(() => {
        this.cdr.detectChanges();
        const checkboxEle = element.children[0].children[0];
        checkboxEle.click();
      }, 200)
    }, 300);
  }

  handlePressEnd() {
    clearTimeout(this.timeout);
  }

  disableNativeContextMenu() {
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  public appHasPasswordChallenge() : boolean {
    return this.noteService.appHasPasswordChallenge();
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

      return true;

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
    if(this.notes === undefined || this.notes === null) {
      return [];
    }

    const parser = new DOMParser;

    for(let i = 0; i < this.notes.length; i++){
      let note = this.notes[i];
      note.text = note.text.replace(/<[^>]*>/g, '');

      const dom = parser.parseFromString(note.text, 'text/html');
      note.text = dom.body.textContent;
    }

    // @ts-ignore
    this.notes = this.notes.sort((a, b) => b.last_modified - a.last_modified);

    return this.notes;
  }

  public settings() {
    this.navController.navigateForward('app-settings').then(r => {});
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
    setTimeout(() => {
      this.cdr.detectChanges();
    })
  }

  public async deleteSelectedNotes() {
    // @ts-ignore
    const modal = await this.modalCtrl.create({
      component: DeleteNoteModalComponent,
      cssClass: 'confirmation-popup'
    });

    modal.onDidDismiss().then(async (data) => {
      if (data && data.data) {
        const { confirm } = data.data;
        if (confirm) {
          await this.deleteNotesConfirm();
        } else {
          // Handle case when user cancels password input
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

    this.setData(this.input_password_app_unlock);

    window.location.href = "/home";
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
          window.location.href='/home';
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
    event.stopImmediatePropagation();
    event.preventDefault();
    
    if (this.isClicked) {
      return;
    }

    this.isClicked = true;

  
    if(this.listOfCheckedCheckboxes.includes(note_id) != true) {
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

}
