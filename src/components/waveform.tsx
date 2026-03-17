"use client";

import { useRef, useEffect } from "react";

interface WaveformProps {
  isSpeaking: boolean;
  className?: string;
}

export function Waveform({ isSpeaking, className }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const raf = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      canvas!.width = rect.width * dpr;
      canvas!.height = rect.height * dpr;
    }
    resize();

    const BAR_COUNT = 40;
    const BAR_GAP = 3 * dpr;
    const SMOOTHING = 0.12;
    const heights = new Float32Array(BAR_COUNT);
    const targets = new Float32Array(BAR_COUNT);

    function animate(time: number) {
      const w = canvas!.width;
      const h = canvas!.height;
      ctx.clearRect(0, 0, w, h);

      const barWidth = (w - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT;
      const maxHeight = h * 0.8;
      const minHeight = 2 * dpr;
      const t = time * 0.001;

      // Green when speaking, blue when listening
      const color = isSpeaking
        ? "rgba(74, 222, 128, 0.8)"  // green-400
        : "rgba(96, 165, 250, 0.5)"; // blue-400

      for (let i = 0; i < BAR_COUNT; i++) {
        // Generate organic target heights
        const center = BAR_COUNT / 2;
        const distFromCenter = Math.abs(i - center) / center;
        const envelope = 1 - distFromCenter * distFromCenter; // parabolic envelope

        if (isSpeaking) {
          // Active waveform — multiple sine waves for organic movement
          const wave1 = Math.sin(t * 3.2 + i * 0.4) * 0.5 + 0.5;
          const wave2 = Math.sin(t * 5.1 + i * 0.25) * 0.3 + 0.5;
          const wave3 = Math.sin(t * 1.7 + i * 0.6) * 0.2 + 0.5;
          const combined = (wave1 + wave2 + wave3) / 3;
          targets[i] = combined * envelope * maxHeight * 0.9 + minHeight;
        } else {
          // Idle — gentle breathing ripple
          const wave = Math.sin(t * 1.5 + i * 0.3) * 0.15 + 0.2;
          targets[i] = wave * envelope * maxHeight * 0.3 + minHeight;
        }

        // Smooth interpolation
        heights[i] += (targets[i] - heights[i]) * SMOOTHING;

        const x = i * (barWidth + BAR_GAP);
        const barH = Math.max(minHeight, heights[i]);
        const y = (h - barH) / 2;

        ctx.fillStyle = color;
        ctx.beginPath();
        const radius = Math.min(barWidth / 2, 3 * dpr);
        ctx.roundRect(x, y, barWidth, barH, radius);
        ctx.fill();
      }

      raf.current = requestAnimationFrame(animate);
    }

    raf.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf.current);
  }, [isSpeaking]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
