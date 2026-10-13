import React from 'react';
import { LoadingSpinner, LoadingMark, InlineSpinner } from '@/components/ui/loading-spinner';

export function LoaderDemo() {
  return (
    <div className="p-8 space-y-8 bg-background min-h-screen">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Optimized Custom Loader</h1>
        <p className="text-muted-foreground">Reduced size with perfect center alignment</p>
      </div>

      {/* Different sizes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8 items-center justify-items-center">
        <div className="text-center space-y-2">
          <LoadingMark size="sm" />
          <p className="text-sm text-muted-foreground">Small (sm)</p>
        </div>
        <div className="text-center space-y-2">
          <LoadingMark size="md" />
          <p className="text-sm text-muted-foreground">Medium (md)</p>
        </div>
        <div className="text-center space-y-2">
          <LoadingMark size="lg" />
          <p className="text-sm text-muted-foreground">Large (lg)</p>
        </div>
        <div className="text-center space-y-2">
          <LoadingMark size="xl" />
          <p className="text-sm text-muted-foreground">Extra Large (xl)</p>
        </div>
      </div>

      {/* With text */}
      <div className="border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Instant Center Positioning</h3>
        <div className="bg-slate-50 rounded-lg" style={{ height: '250px', position: 'relative' }}>
          <LoadingSpinner size="lg" text="Always appears at center instantly..." />
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          ✨ No jumping from top to center - appears exactly where it should be from frame 1
        </p>
      </div>

      {/* Custom colors */}
      <div className="border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Custom Colors</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center justify-items-center">
          <div className="text-center space-y-2">
            <LoadingMark size="lg" color1="#dc2626" color2="#fbbf24" />
            <p className="text-sm text-muted-foreground">Red & Yellow</p>
          </div>
          <div className="text-center space-y-2">
            <LoadingMark size="lg" color1="#059669" color2="#10b981" />
            <p className="text-sm text-muted-foreground">Green Theme</p>
          </div>
          <div className="text-center space-y-2">
            <LoadingMark size="lg" color1="#7c3aed" color2="#a78bfa" />
            <p className="text-sm text-muted-foreground">Purple Theme</p>
          </div>
        </div>
      </div>

      {/* Inline spinner */}
      <div className="border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Inline Spinner (for buttons)</h3>
        <div className="space-y-4">
          <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md">
            <InlineSpinner />
            Processing Sale...
          </button>
          <button className="flex items-center gap-2 px-4 py-2 border rounded-md">
            Loading
            <InlineSpinner />
          </button>
        </div>
      </div>

      {/* Real-world examples */}
      <div className="border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Real-world Usage Examples</h3>
        <div className="space-y-6">
          <div className="bg-slate-50 rounded-md relative" style={{ height: '120px' }}>
            <LoadingSpinner size="md" text="Loading products..." />
          </div>
          <div className="bg-slate-50 rounded-md relative" style={{ height: '120px' }}>
            <LoadingSpinner size="lg" text="Processing inventory update..." />
          </div>
          <div className="bg-slate-50 rounded-md relative" style={{ height: '120px' }}>
            <LoadingSpinner size="sm" text="Syncing data..." />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3 text-center">
          Notice how all loaders appear instantly at the center, regardless of container size
        </p>
      </div>
    </div>
  );
}