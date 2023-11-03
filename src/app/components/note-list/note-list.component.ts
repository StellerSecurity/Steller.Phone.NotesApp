import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { INote } from 'src/app/types';

@Component({
  selector: 'note-list',
  templateUrl: './note-list.component.html',
  styleUrls: ['./note-list.component.scss'],
})
export class NoteListComponent implements OnInit {
  constructor() {}

  @Input() notes: INote[] = [];
  @Output() clickEvent = new EventEmitter<any>();

  handleClick($event: any, id: string) {
    this.clickEvent.emit(id);
  }

  ngOnInit() {}
}
