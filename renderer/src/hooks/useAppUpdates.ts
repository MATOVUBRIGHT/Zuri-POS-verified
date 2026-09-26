import { useState, useEffect } from 'react';

export interface UpdateInfo {
  version: string;
  releaseNotes?: string;
}

export interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
}

export function useAppUpdates() {
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [updateReady, setUpdateReady] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    const api = (window as any).api;
    if (!api?.onUpdateAvailable) return;

    api.onUpdateAvailable((info: UpdateInfo) => {
      setUpdateAvailable(info);
    });
    api.onUpdateProgress((progress: DownloadProgress) => {
      setDownloadProgress(progress);
    });
    api.onUpdateDownloaded((info: UpdateInfo) => {
      setUpdateReady(info);
      setDownloadProgress(null);
    });
  }, []);

  const installUpdate = () => {
    (window as any).api?.installUpdate?.();
  };

  const checkForUpdate = () => {
    (window as any).api?.checkForUpdate?.();
  };

  return { updateAvailable, downloadProgress, updateReady, installUpdate, checkForUpdate };
}
