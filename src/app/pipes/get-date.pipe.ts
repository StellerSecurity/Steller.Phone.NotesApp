import { Pipe, PipeTransform } from '@angular/core';
import * as dayjs from 'dayjs';

type TransType = 'date' | 'month' | 'year';

@Pipe({
  name: 'getFormatedDateNote',
})
export class GetFormatedDatePipe implements PipeTransform {
  transform(date: string, transType: TransType): any {
    if (date == '') return 0;

    const _date = dayjs(date);

    switch (transType) {
      case 'date':
        return _date.format("DD");
      case 'month':
        return _date.format('MMM');
      case 'year':
        return _date.get('year');
    }
  }
}
