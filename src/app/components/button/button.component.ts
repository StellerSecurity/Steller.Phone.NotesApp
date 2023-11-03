import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'note-button',
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.scss'],
})
export class ButtonComponent implements OnInit {
  constructor() {}

  @Input() value: string = '';
  @Input() className: string = '';
  @Output() onClick = new EventEmitter<any>();

  ngOnInit() {}

  handleClick($event: any) {
    this.onClick.emit($event);
  }
}
