import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

export function useNetworkOffline(): { ready: boolean; offline: boolean } {
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let mounted = true;

    const apply = (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
      if (!mounted) return;
      setOffline(state.isConnected === false || state.isInternetReachable === false);
    };

    const readyTimer = setTimeout(() => {
      if (mounted) setReady(true);
    }, 3000);

    NetInfo.fetch()
      .then((state) => {
        apply(state);
        if (mounted) {
          clearTimeout(readyTimer);
          setReady(true);
        }
      })
      .catch(() => {
        if (mounted) {
          clearTimeout(readyTimer);
          setReady(true);
        }
      });

    const unsubscribe = NetInfo.addEventListener(apply);
    return () => {
      mounted = false;
      clearTimeout(readyTimer);
      unsubscribe();
    };
  }, []);

  return { ready, offline };
}
