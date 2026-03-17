"use client";

import { useState, useCallback, useRef } from "react";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ITERATIONS_PER_LETTER = 6;
const INTERVAL_MS = 30;

interface ShuffleTextProps {
  text: string;
  className?: string;
}

export function ShuffleText({ text, className }: ShuffleTextProps) {
  const [display, setDisplay] = useState(text);
  const animating = useRef(false);

  const handleMouseEnter = useCallback(() => {
    if (animating.current) return;
    animating.current = true;

    let iteration = 0;
    const totalIterations = text.length * ITERATIONS_PER_LETTER;

    const interval = setInterval(() => {
      setDisplay(
        text
          .split("")
          .map((char, i) => {
            // How many iterations until this letter "locks in"
            const lockAt = i * ITERATIONS_PER_LETTER;
            if (iteration >= lockAt) return char;
            if (char === " ") return " ";
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

  return (
    <span className={className} onMouseEnter={handleMouseEnter}>
      {display}
    </span>
  );
}
