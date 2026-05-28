import React from 'react';

const LoadingScreen: React.FC = () => {
  return (
    <div
      className="min-h-[100vh] min-h-[100dvh] flex flex-col items-center justify-center bg-background"
      role="status"
      aria-label="Loading application"
    >
      <div className="relative h-12 w-12 mb-4">
        <div
          className="absolute inset-0 rounded-full border-4 border-transparent animate-spin"
          style={{
            borderTopColor: 'hsl(var(--primary))',
            borderRightColor: 'hsl(var(--primary))',
          }}
        />
        <div
          className="absolute inset-2 rounded-full border-4 border-transparent animate-spin"
          style={{
            borderBottomColor: 'hsl(var(--primary))',
            animationDirection: 'reverse',
            animationDuration: '0.8s',
          }}
        />
      </div>
      {/*
        BUG-VIVA-20260525-301: --primary at hsl(22 25% 51%) on a white/ivory
        background only reaches 3.83:1 — below WCAG 2 AA's 4.5:1 for normal
        text. The loading copy is functional ("Loading...") rather than
        brand-decorative; switching to text-foreground gets ~12:1 contrast.
        The brand identity still reads via the dual spinner above.
       */}
      <p className="text-sm font-medium tracking-wide text-foreground">
        Loading TheWeddingBot...
      </p>
    </div>
  );
};

export default LoadingScreen;
