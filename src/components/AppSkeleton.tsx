import React from 'react';

export function AppSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header skeleton */}
      <div className="h-16 bg-slate-50 border-b flex items-center px-4">
        <div className="h-8 w-32 bg-slate-200 rounded animate-pulse"></div>
        <div className="ml-auto flex space-x-3">
          <div className="h-8 w-8 bg-slate-200 rounded animate-pulse"></div>
          <div className="h-8 w-8 bg-slate-200 rounded animate-pulse"></div>
        </div>
      </div>
      
      <div className="flex">
        {/* Sidebar skeleton */}
        <div className="w-64 h-screen bg-slate-50 border-r p-4">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="flex items-center space-x-3">
                <div className="h-5 w-5 bg-slate-200 rounded animate-pulse"></div>
                <div className="h-4 flex-1 bg-slate-200 rounded animate-pulse"></div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Main content skeleton */}
        <div className="flex-1 p-6">
          <div className="space-y-6">
            {/* Title skeleton */}
            <div className="h-8 w-48 bg-slate-200 rounded animate-pulse"></div>
            
            {/* Cards skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white p-6 rounded-lg border">
                  <div className="h-4 w-24 bg-slate-200 rounded animate-pulse mb-3"></div>
                  <div className="h-8 w-16 bg-slate-200 rounded animate-pulse"></div>
                </div>
              ))}
            </div>
            
            {/* Chart skeleton */}
            <div className="bg-white p-6 rounded-lg border">
              <div className="h-6 w-32 bg-slate-200 rounded animate-pulse mb-4"></div>
              <div className="h-64 bg-slate-100 rounded animate-pulse"></div>
            </div>
            
            {/* Table skeleton */}
            <div className="bg-white rounded-lg border">
              <div className="p-6 border-b">
                <div className="h-6 w-40 bg-slate-200 rounded animate-pulse"></div>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex space-x-4">
                      <div className="h-4 w-1/4 bg-slate-200 rounded animate-pulse"></div>
                      <div className="h-4 w-1/4 bg-slate-200 rounded animate-pulse"></div>
                      <div className="h-4 w-1/4 bg-slate-200 rounded animate-pulse"></div>
                      <div className="h-4 w-1/4 bg-slate-200 rounded animate-pulse"></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Loading indicator */}
      <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-lg p-4 border">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="loader zuri-loader" style={{"--size": "0.5px"} as React.CSSProperties}></div>
          </div>
          <span className="text-sm text-slate-600">Loading your POS system...</span>
        </div>
      </div>
    </div>
  );
}

export function QuickAppSkeleton() {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background">
      <div className="text-center space-y-4">
        <div className="relative mx-auto">
          <div className="loader zuri-loader" style={{"--size": "1px"} as React.CSSProperties}></div>
        </div>
        <p className="text-lg font-medium text-slate-700">Starting POS System</p>
        <p className="text-sm text-slate-500">Initializing your workspace...</p>
      </div>
    </div>
  );
}