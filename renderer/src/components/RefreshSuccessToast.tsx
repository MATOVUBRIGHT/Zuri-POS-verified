/**
 * Bottom notification: "✔ Data refreshed successfully"
 * Green text, smooth fade in/out, auto-dismiss after 2.5s
 */
import React, { useEffect, useState } from 'react';

interface RefreshSuccessToastProps {
  visible: boolean;
  onDismiss?: () => void;
}

export const RefreshSuccessToast = React.memo(function RefreshSuccessToast({ visible, onDismiss }: RefreshSuccessToastProps) {
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    if (!visible) {
      setOpacity(0);
      return;
    }

    setOpacity(1);

    const t = setTimeout(() => {
      setOpacity(0);
      setTimeout(() => onDismiss?.(), 300);
    }, 2500);

    return () => clearTimeout(t);
  }, [visible, onDismiss]);

  if (!visible && opacity === 0) return null;

  return (
    <div
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[100] pointer-events-none"
      style={{
        opacity,
        transition: 'opacity 0.3s ease-in-out',
      }}
    >
      <div className="bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
        <span className="text-lg">✔</span>
        <span className="font-medium">Data refreshed successfully</span>
      </div>
    </div>
  );
});
