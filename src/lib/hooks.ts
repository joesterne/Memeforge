import { useEffect, useState, useRef, RefObject } from "react";

export function useIntersectionObserver(
  ref: RefObject<Element | null>,
  options: IntersectionObserverInit = {},
  forward: boolean = true,
): boolean {
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
      if (forward && entry.isIntersecting) {
        observer.disconnect();
      }
    }, options);

    observer.observe(ref.current);

    return () => {
      observer.disconnect();
    };
  }, [ref, options, forward]);

  return isIntersecting;
}
