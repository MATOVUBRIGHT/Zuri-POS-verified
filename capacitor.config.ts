import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.brec.pos',
  appName: 'brepos POS',
  webDir: 'dist',
  plugins: {
    Camera: {
      allowEditing: true,
      saveToGallery: false,
      quality: 90
    },
    Printer: {
      provider: 'system'
    },
    BarcodeScanner: {
      formats: ['QR_CODE', 'CODE_128', 'CODE_39', 'EAN_13', 'EAN_8', 'UPC_A', 'UPC_E']
    }
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true
  },
  ios: {
    allowsLinkPreview: false,
    webContentsDebuggingEnabled: true
  }
};

export default config;
