import { Skeleton } from "@/components/ui/skeleton";

const SkeletonLoader = ({ rows = 3, className = "" }: { rows?: number; className?: string }) => {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
};

export default SkeletonLoader;
