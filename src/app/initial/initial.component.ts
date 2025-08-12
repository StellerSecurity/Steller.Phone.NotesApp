import { Component, OnInit } from "@angular/core";
import { NotesService } from "../services/notes.service";
import { Router } from "@angular/router";

@Component({
  selector: "app-initial",
  templateUrl: "./initial.component.html",
  styleUrls: ["./initial.component.scss"],
})
export class InitialComponent implements OnInit {
  constructor(public noteService: NotesService, private router: Router) {}

  ngOnInit() {
    const notes: any = JSON.parse(this.noteService.getNotes()) || [];
    if (typeof notes === "string") {
      return;
    }

    const recentOpenedNoteId = localStorage.getItem("recentOpenedNoteId");

    if (recentOpenedNoteId) {
      const recentNote = notes.find(
        (note: any) => String(note.id) === String(recentOpenedNoteId)
      );

      if (recentNote && recentNote.id) {
        this.router.navigate(["/note/" + recentNote.id]);
      }
    }
  }
}
