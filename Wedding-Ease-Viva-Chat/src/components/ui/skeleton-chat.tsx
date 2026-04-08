import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const SkeletonChat: React.FC = () => {
  return (
    <div
      className="flex flex-col gap-4 p-4 w-full max-w-2xl mx-auto"
      role="status"
      aria-label="Loading chat messages"
    >
      {/* Bot message skeleton */}
      <div className="flex items-start gap-3">
        <Skeleton className="h-8 w-8 rounded-full shrink-0" />
        <div className="flex flex-col gap-2 max-w-[75%]">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-36" />
        </div>
      </div>

      {/* User message skeleton */}
      <div className="flex items-start gap-3 justify-end">
        <div className="flex flex-col gap-2 items-end max-w-[75%]">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-8 w-8 rounded-full shrink-0" />
      </div>

      {/* Bot message skeleton */}
      <div className="flex items-start gap-3">
        <Skeleton className="h-8 w-8 rounded-full shrink-0" />
        <div className="flex flex-col gap-2 max-w-[75%]">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-44" />
        </div>
      </div>

      {/* User message skeleton */}
      <div className="flex items-start gap-3 justify-end">
        <div className="flex flex-col gap-2 items-end max-w-[75%]">
          <Skeleton className="h-4 w-52" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-8 w-8 rounded-full shrink-0" />
      </div>
    </div>
  );
};

export default SkeletonChat;
