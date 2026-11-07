"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/** Tracks an element's width with ResizeObserver. */
export function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0].contentRect.width);
      setWidth((prev) => (prev === w ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}
