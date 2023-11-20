import {
  Component,
  OnChanges,
  Input,
  Output,
  EventEmitter,
} from '@angular/core';
import { SimpleChanges } from '@angular/core';
import { INote } from 'src/app/types';

@Component({
  selector: 'note-list',
  templateUrl: './note-list.component.html',
  styleUrls: ['./note-list.component.scss'],
})
export class NoteListComponent implements OnChanges {
  constructor() {}

  @Input() notes: INote[] = [];
  @Output() clickEvent = new EventEmitter<any>();
  @Output() checkEvent = new EventEmitter<Set<string>>();
  @Input() isCheckable: boolean = true;

  public selected: Set<string>;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isCheckable']) {
      if (changes['isCheckable'].currentValue) {
        this.initCheckedIds();
      }
    }
  }

  private initCheckedIds(): void {
    this.selected = new Set();

    this.checkEvent.emit(this.selected);
  }

  public getIsChecked(id: string) {
    return this.selected.has(id);
  }

  handleClick($event: any, id: string) {
    if (this.isCheckable) {
      if (this.getIsChecked(id)) this.selected.delete(id);
      else this.selected.add(id);

      this.checkEvent.emit(this.selected);
    } else {
      this.clickEvent.emit(id);
    }
  }
}
