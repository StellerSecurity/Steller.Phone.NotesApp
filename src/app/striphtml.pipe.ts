import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'striphtml'
})
export class StriphtmlPipe implements PipeTransform {

  transform(value: string): string {
    if (!value) {
      return '';
    }

    const parser = new DOMParser();

    value = value
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/div>/gi, ' ')
      .replace(/<div[^>]*>/gi, ' ')
      .replace(/<\/p>/gi, ' ')
      .replace(/<p[^>]*>/gi, ' ')
      .replace(/<\/li>/gi, ' ')
      .replace(/<li[^>]*>/gi, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/<[^>]*>/g, ' ');

    const dom = parser.parseFromString(value, 'text/html');
    const text = dom.body.textContent || '';

    return text.replace(/\s+/g, ' ').trim();
  }

}
