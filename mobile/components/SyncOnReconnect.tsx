import { useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';

import { processOutbox } from '../services/outbox';

/**
 * Flushes the assessment outbox when the device regains connectivity.
 */
export function SyncOnReconnect() {
  useEffect(() => {
    void processOutbox();
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        void processOutbox();
      }
    });
    return () => unsubscribe();
  }, []);
  return null;
}
