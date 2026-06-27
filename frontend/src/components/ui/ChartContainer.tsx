import React, { useEffect, useRef, useState } from 'react';

/**
 * Defers rendering its children (recharts charts) until the container has a
 * measured, non-zero size. Recharts' ResponsiveContainer warns with
 * "width(-1) and height(-1)" when it mounts before layout — mounting the chart
 * one frame after the container is measurable eliminates that noise.
 */
export const ChartContainer: React.FC<{
  className?: string;
  children: React.ReactNode;
}> = ({ className, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const check = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        // One extra frame so the chart mounts into a fully laid-out container.
        raf = requestAnimationFrame(() => setReady(true));
        observer.disconnect();
      }
    };
    const observer = new ResizeObserver(check);
    observer.observe(el);
    check();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {ready ? children : null}
    </div>
  );
};
