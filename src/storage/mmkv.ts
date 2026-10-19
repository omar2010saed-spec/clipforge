import { MMKV } from 'react-native-mmkv';

/** Fast key-value storage for small settings (language, last-used options...). */
export const settings = new MMKV({ id: 'clipforge-settings' });
