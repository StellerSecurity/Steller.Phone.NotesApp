import { TestBed } from '@angular/core/testing';

import { PasswordHelperService } from './password-helper.service';

describe('PasswordHelperService', () => {
  let service: PasswordHelperService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PasswordHelperService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
