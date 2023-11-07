export interface INote {
  id: string;
  protected: boolean;
  title: string;
  text: string;
  last_modified: string;
}

export interface IModalInfo {
  title: string;
  text: string;
  button1: {
    label: string;
    color: 'note-primary' | 'note-danger' | 'note-success';
  };
  button2: {
    label: string;
    color: 'note-primary' | 'note-danger' | 'note-success';
  };
}
