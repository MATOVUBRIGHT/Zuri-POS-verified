/**
 * Online/Offline status indicator
 * Green = online, Red = offline. Uses navigator.onLine.
 */
import { useState, useEffect } from 'react'

export const NetworkStatusIndicator = () => {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return (
    <div
      className={`fixed bottom-4 right-4 px-3 py-2 rounded-lg shadow-lg text-sm z-50 flex items-center gap-2 ${
        online ? 'bg-green-600 text-white' : 'bg-red-600 text-white animate-pulse'
      }`}
    >
      <div
        className={`w-2.5 h-2.5 rounded-full ${
          online ? 'bg-white' : 'bg-white'
        }`}
      />
      <span className="font-medium">{online ? 'Online' : 'Offline'}</span>
    </div>
  )
}
