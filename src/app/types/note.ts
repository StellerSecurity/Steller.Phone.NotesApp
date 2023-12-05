export interface INote {
  id: string;
  protected: boolean;
  text: string;
  last_modified: string;
  expired_date: EExpiredDate;
}

export interface IModalInfo {
  title: string;
  text: string;
  button1: {
    label: string;
    color: string;
  };
  button2: {
    label: string;
    color: string;
  };
}

export const enum EExpiredDate {
  "day_1" = "1DAY",
  "day_3" = "3DAYS",
  "day_7" = "7DAYS",
  "day_14" = "14DAYS",
  "month_1" = "1MONTH",
  "month_2" = "2MONTHS",
  "month_3" = "3MONTHS",
  "month_6" = "6MONTHS",
  "never" = "NEVER"
}