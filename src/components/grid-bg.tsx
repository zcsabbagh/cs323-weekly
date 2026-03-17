"use client";

import { useRef, useEffect } from "react";

export function GridBackground({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const raf = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      canvas!.width = window.innerWidth * dpr;
      canvas!.height = window.innerHeight * dpr;
      canvas!.style.width = `${window.innerWidth}px`;
      canvas!.style.height = `${window.innerHeight}px`;
    }
    resize();
    window.addEventListener("resize", resize);

    const dots: { x: number; y: number; phase: number; speed: number }[] = [];
    const spacing = 40 * dpr;
    const cols = Math.ceil((window.innerWidth * dpr) / spacing) + 1;
    const rows = Math.ceil((window.innerHeight * dpr) / spacing) + 1;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        dots.push({
          x: c * spacing,
          y: r * spacing,
          phase: Math.random() * Math.PI * 2,
          speed: 0.3 + Math.random() * 0.4,
        });
      }
    }

    const dotRadius = 1.2 * dpr;

    function animate(time: number) {
      const t = time * 0.001;
      ctx.clearRect(0, 0, canvas!.width, canvas!.height);

      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        const alpha = 0.06 + 0.06 * Math.sin(t * d.speed + d.phase);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      raf.current = requestAnimationFrame(animate);
    }

    raf.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`fixed inset-0 pointer-events-none ${className || ""}`}
    />
  );
}
