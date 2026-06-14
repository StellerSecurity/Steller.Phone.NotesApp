import { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'steller.phone.notesapp',
  appName: 'Stellar Private Notes',
  webDir: 'www',
  plugins: {
    Keyboard: {
      resize: KeyboardResize.None,
      resizeOnFullScreen: true
    },
    AppsFlyer: {
      devKey: "${APPSFLYER_DEV_KEY}",
      appId: "${IOS_APP_ID}",
      isDebug: false
    }
  },
  server: {
    androidScheme: 'https'
  }
};

export default config;
