import { ProfileComponent } from './profile.component';

describe('Logout data protection', () => {
  for (const pending of ['editor', 'outbox']) {
    it('does not wipe notes while ' + pending + ' changes are pending', async () => {
      const page: any = Object.create(ProfileComponent.prototype);
      page.translatorService = { allTranslations: {} };
      page.notesService = { flushPersistence: async () => {}, hasPendingMutations: () => pending === 'editor' };
      page.outbox = { getAll: async () => pending === 'outbox' ? [{}] : [] };
      page.dataService = { clearAppData: jasmine.createSpy('wipe') };
      const present = jasmine.createSpy('present').and.resolveTo();
      page.alertController = { create: async () => ({ present }) };
      await page.logout();
      expect(page.dataService.clearAppData).not.toHaveBeenCalled();
      expect(present).toHaveBeenCalled();
    });
  }
});
