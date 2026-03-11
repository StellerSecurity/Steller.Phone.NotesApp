import { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'Steller.Phone.NotesApp',
  appName: 'Stellar Notes',
  webDir: 'www',
  plugins: {
    Keyboard: {
      resize: KeyboardResize.None,
      resizeOnFullScreen: true
    }
  },
  server: {
    androidScheme: 'https'
  }
};

export default config;
