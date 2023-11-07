import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'note-button',
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.scss'],
})
export class ButtonComponent {
  public _className: string = '';

  constructor() {}

  @Input() value: string = '';
  @Input() className: string = '';
  @Output() clickEvent = new EventEmitter<any>();
  @Input() color: 'note-primary' | 'note-danger' | 'note-success' | null =
    'note-primary';
  @Input() fill: 'outline' | 'solid' = 'solid';
  @Input() size: 'lg' | 'md' | 'sm' = 'lg';

  ngOnInit() {
    this._className = '';

    switch (this.color) {
      case 'note-danger':
        this._className += ' setting-color-danger';
        this.color = null;
        break;
      case 'note-success':
        this._className += ' setting-color-success';
        this.color = null;
        break;
    }

    switch (this.size) {
      case 'lg':
        this._className += ' setting-size-lg';
        break;

      case 'md':
        this._className += ' setting-size-md';
        break;

      case 'sm':
        this._className += ' setting-size-sm';
        break;
    }
  }

  handleClick($event: any) {
    this.clickEvent.emit($event);
  }
}
