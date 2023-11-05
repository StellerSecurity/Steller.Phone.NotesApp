import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'note-button',
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.scss'],
})
export class ButtonComponent {
  public _className: string= "";

  constructor() {}

  @Input() value: string = '';
  @Input() className: string = '';
  @Output() clickEvent = new EventEmitter<any>();
  @Input() color: "primary" | "danger" = "primary";

  ngOnChanges() {
    this._className = this.className;

    switch(this.color) {
      case "danger":
        this._className += " setting-color-danger";
        break
      default:
        this._className += " setting-color-primary"
        break;
    }
  }

  handleClick($event: any) {
    this.clickEvent.emit($event);
  }
}
