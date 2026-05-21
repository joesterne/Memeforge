import React, { useRef, useEffect } from "react";
import { useIntersectionObserver } from "../lib/hooks";

export function InfiniteScrollLoader({
  onLoadMore,
  hasMore,
  loading = false,
}: {
  onLoadMore: () => void;
  hasMore: boolean;
  loading?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const options = React.useMemo(() => {
    return {
      root: document.getElementById("main-scroll-container"),
      rootMargin: "400px"
    };
  }, []);
  const isVisible = useIntersectionObserver(
    ref,
    options,
    false,
  );

  useEffect(() => {
    if (isVisible && hasMore && !loading) {
      onLoadMore();
    }
  }, [isVisible, hasMore, loading, onLoadMore]);

  if (!hasMore) return null;

  return (
    <div ref={ref} className="w-full flex justify-center py-8">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}
