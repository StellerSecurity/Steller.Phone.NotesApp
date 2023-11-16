export interface INote {
  id: string;
  protected: boolean;
  text: string;
  last_modified: string;
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
