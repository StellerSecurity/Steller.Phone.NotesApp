import { Injectable } from '@angular/core';
import { EExpiredDate } from '../types';
import * as dayjs from 'dayjs';
import * as duration from 'dayjs/plugin/duration';

dayjs.extend(duration);

@Injectable({ providedIn: 'root' })
export class ExpireService {
  expireTimes: { [key in EExpiredDate]: number | 'NEVER' };

  constructor() {
    this.expireTimes = {
      '1DAY': this.getMillisecond(1, 'day'),
      '3DAYS': this.getMillisecond(2, 'day'),
      '7DAYS': this.getMillisecond(7, 'day'),
      '14DAYS': this.getMillisecond(14, 'day'),
      '1MONTH': this.getMillisecond(1, 'month'),
      '2MONTHS': this.getMillisecond(2, 'month'),
      '3MONTHS': this.getMillisecond(3, 'month'),
      '6MONTHS': this.getMillisecond(6, 'month'),
      NEVER: 'NEVER',
    };
  }

  getMillisecond = (value: number, type: dayjs.ManipulateType): number => {
    return dayjs.duration({ [type]: value }).asMilliseconds();
  };

  deletable = (last_time: number, expire: EExpiredDate): boolean => {
    const expireTime = this.expireTimes[expire];

    if (expireTime == 'NEVER') return false;

    const currentDate = dayjs().valueOf();
    console.log("currentTime", currentDate);
    console.log("last_time", last_time);
    console.log("expireTime", expireTime);
    console.log(currentDate - (last_time + expireTime));
    return currentDate > last_time + expireTime;
  };
}
