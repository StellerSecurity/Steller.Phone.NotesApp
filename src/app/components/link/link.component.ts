import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'note-link',
  templateUrl: './link.component.html',
  styleUrls: ['./link.component.scss'],
})
export class LinkComponent implements OnInit {
  constructor() {}

  @Input() href: string = '/';
  @Input() class?: string = '';
  @Input() variant?: "primary" | "danger" = "primary"
  @Input() value: string = "";

  ngOnInit() {}
}
