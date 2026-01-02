import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ScrollService {
  private positions = new Map<string, number>();

  save(url: string, y: number) {
    this.positions.set(url, y);
  }

  get(url: string): number {
    return this.positions.get(url) ?? 0;
  }
}
