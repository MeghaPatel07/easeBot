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
            borderTopColor: '#A17A63',
            borderRightColor: '#A17A63',
          }}
        />
        <div
          className="absolute inset-2 rounded-full border-4 border-transparent animate-spin"
          style={{
            borderBottomColor: '#A17A63',
            animationDirection: 'reverse',
            animationDuration: '0.8s',
          }}
        />
      </div>
      <p
        className="text-sm font-medium tracking-wide"
        style={{ color: '#A17A63' }}
      >
        Loading EaseBot...
      </p>
    </div>
  );
};

export default LoadingScreen;
