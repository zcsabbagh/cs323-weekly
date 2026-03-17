"use client";

import { useState, useCallback, useRef, useEffect } from "react";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const ITERATIONS_PER_LETTER = 5;
const INTERVAL_MS = 30;

interface ShuffleTextProps {
  text: string;
  className?: string;
}

export function ShuffleText({ text, className }: ShuffleTextProps) {
  const [display, setDisplay] = useState(text);
  const animating = useRef(false);
  const ref = useRef<HTMLSpanElement>(null);

  const scramble = useCallback(() => {
    if (animating.current) return;
    animating.current = true;

    let iteration = 0;
    const totalIterations = text.length * ITERATIONS_PER_LETTER;

    const interval = setInterval(() => {
      setDisplay(
        text
          .split("")
          .map((char, i) => {
            if (char === " ") return " ";
            const lockAt = (i + 1) * ITERATIONS_PER_LETTER;
            if (iteration >= lockAt) return char;
            return CHARS[Math.floor(Math.random() * CHARS.length)];
          })
          .join("")
      );

      iteration++;

      if (iteration > totalIterations) {
        clearInterval(interval);
        setDisplay(text);
        animating.current = false;
      }
    }, INTERVAL_MS);
  }, [text]);

  // Listen on the parent element for mouseenter since
  // the span may not cover the full link hit area
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parent = el.closest("a") || el.parentElement;
    if (!parent) return;

    parent.addEventListener("mouseenter", scramble);
    return () => parent.removeEventListener("mouseenter", scramble);
  }, [scramble]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}
