"use client";

import { useRef, useEffect, useCallback } from "react";

// Binary characters revealed at zoom — the "aha" moment
const BINARY = "01";
const ASCII_RAMP = " .:+x$&";

const MOUSE_RADIUS = 60;
const MOUSE_FORCE = 3000;
const SPRING_K = 0.04;
const DAMPING = 0.85;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
  brightness: number;
  baseChar: string;
  binaryChar: string;
  displaced: boolean;
}

function luma(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

interface Props {
  imageSrc: string;
  className?: string;
}

export function AsciiArt({ imageSrc, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const mouse = useRef({ x: -9999, y: -9999 });
  const raf = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Zoom/pan state
  const zoom = useRef(1);
  const pan = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  // Static cache for non-displaced particles
  const staticCanvas = useRef<HTMLCanvasElement | null>(null);
  const needsStaticRedraw = useRef(true);
  const canvasSize = useRef({ w: 0, h: 0 });
  const cellSizeRef = useRef(0);

  // Convert screen coords to canvas coords accounting for zoom/pan
  const screenToCanvas = useCallback((sx: number, sy: number) => {
    const z = zoom.current;
    const p = pan.current;
    return {
      x: (sx - p.x) / z,
      y: (sy - p.y) / z,
    };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      if (dragging.current) {
        pan.current.x = panStart.current.x + (e.clientX - dragStart.current.x);
        pan.current.y = panStart.current.y + (e.clientY - dragStart.current.y);
        needsStaticRedraw.current = true;
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const sx = (e.clientX - rect.left) * dpr;
      const sy = (e.clientY - rect.top) * dpr;
      const canvasCoord = screenToCanvas(sx, sy);
      mouse.current.x = canvasCoord.x;
      mouse.current.y = canvasCoord.y;
    },
    [screenToCanvas]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      dragging.current = true;
      dragStart.current = { x: e.clientX, y: e.clientY };
      panStart.current = { ...pan.current };
    },
    []
  );

  const handleMouseUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouse.current = { x: -9999, y: -9999 };
    dragging.current = false;
  }, []);

  // Attach wheel with passive:false so we can preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const mx = (e.clientX - rect.left) * dpr;
      const my = (e.clientY - rect.top) * dpr;

      const oldZoom = zoom.current;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.5, Math.min(12, oldZoom * delta));

      pan.current.x = mx - (mx - pan.current.x) * (newZoom / oldZoom);
      pan.current.y = my - (my - pan.current.y) * (newZoom / oldZoom);
      zoom.current = newZoom;
      needsStaticRedraw.current = true;
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageSrc;

    img.onload = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      canvasSize.current = { w: canvas.width, h: canvas.height };

      // Contain image in canvas
      const imgAspect = img.width / img.height;
      const cAspect = cw / ch;
      let dw: number, dh: number, ox: number, oy: number;
      if (cAspect > imgAspect) {
        dh = ch;
        dw = ch * imgAspect;
        ox = (cw - dw) / 2;
        oy = 0;
      } else {
        dw = cw;
        dh = cw / imgAspect;
        ox = 0;
        oy = (ch - dh) / 2;
      }

      // Sample at reasonable density — cellSize 8 keeps particle count manageable
      const cellSize = 8;
      cellSizeRef.current = cellSize * dpr;
      const cs = cellSize * dpr;

      const offscreen = document.createElement("canvas");
      offscreen.width = Math.round(dw);
      offscreen.height = Math.round(dh);
      const offCtx = offscreen.getContext("2d")!;
      offCtx.drawImage(img, 0, 0, dw, dh);
      const imgData = offCtx.getImageData(0, 0, Math.round(dw), Math.round(dh));
      const px = imgData.data;
      const iw = Math.round(dw);

      const cols = Math.floor(dw / cellSize);
      const rows = Math.floor(dh / cellSize);
      const oxD = ox * dpr;
      const oyD = oy * dpr;

      const parts: Particle[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const sx = Math.floor(c * cellSize + cellSize / 2);
          const sy = Math.floor(r * cellSize + cellSize / 2);
          if (sx >= iw || sy >= Math.round(dh)) continue;
          const i = (sy * iw + sx) * 4;
          const brightness = luma(px[i], px[i + 1], px[i + 2]);
          if (brightness > 235) continue; // skip bg

          const hx = oxD + c * cs + cs / 2;
          const hy = oyD + r * cs + cs / 2;
          const bi = Math.floor(((255 - brightness) / 255) * (ASCII_RAMP.length - 1));
          const charIdx = Math.max(0, Math.min(ASCII_RAMP.length - 1, bi));

          parts.push({
            x: hx,
            y: hy,
            vx: 0,
            vy: 0,
            homeX: hx,
            homeY: hy,
            brightness,
            baseChar: ASCII_RAMP[charIdx],
            binaryChar: BINARY[Math.random() > 0.5 ? 1 : 0],
            displaced: false,
          });
        }
      }
      particles.current = parts;

      // Create static canvas for caching
      const sc = document.createElement("canvas");
      sc.width = canvas.width;
      sc.height = canvas.height;
      staticCanvas.current = sc;
      needsStaticRedraw.current = true;

      const fontSize = 7 * dpr;
      const mouseRadius = MOUSE_RADIUS * dpr;
      const mouseRadiusSq = mouseRadius * mouseRadius;
      const mouseForce = MOUSE_FORCE * dpr;
      let frameCount = 0;

      function drawStatic() {
        const sctx = staticCanvas.current!.getContext("2d")!;
        const z = zoom.current;
        const p = pan.current;
        sctx.clearRect(0, 0, canvasSize.current.w, canvasSize.current.h);
        sctx.save();
        sctx.translate(p.x, p.y);
        sctx.scale(z, z);
        sctx.font = `${fontSize}px monospace`;
        sctx.textAlign = "center";
        sctx.textBaseline = "middle";

        const ps = particles.current;
        // Determine which chars to show based on zoom
        const showBinary = z > 3;

        for (let i = 0; i < ps.length; i++) {
          const pt = ps[i];
          if (pt.displaced) continue;
          const gray = Math.min(255, Math.round((255 - pt.brightness) * 1.3));
          if (gray < 8) continue;
          sctx.fillStyle = `rgb(${gray},${gray},${gray})`;
          sctx.fillText(showBinary ? pt.binaryChar : pt.baseChar, pt.homeX, pt.homeY);
        }
        sctx.restore();
        needsStaticRedraw.current = false;
      }

      function animate() {
        frameCount++;
        const ps = particles.current;
        const mx = mouse.current.x;
        const my = mouse.current.y;
        const z = zoom.current;
        const p = pan.current;
        const showBinary = z > 3;

        // Cycle binary chars occasionally
        if (frameCount % 6 === 0) {
          for (let i = 0; i < ps.length; i++) {
            if (Math.random() < 0.08) {
              ps[i].binaryChar = BINARY[Math.random() > 0.5 ? 1 : 0];
              if (!ps[i].displaced) needsStaticRedraw.current = true;
            }
          }
        }

        // Physics — only for particles near mouse
        let anyDisplaced = false;
        for (let i = 0; i < ps.length; i++) {
          const pt = ps[i];
          const dx = pt.x - mx;
          const dy = pt.y - my;
          const distSq = dx * dx + dy * dy;

          if (distSq < mouseRadiusSq && distSq > 0.1) {
            const dist = Math.sqrt(distSq);
            const force = mouseForce / distSq;
            pt.vx += (dx / dist) * force;
            pt.vy += (dy / dist) * force;
          }

          // Only run spring/damping if displaced
          const offX = pt.homeX - pt.x;
          const offY = pt.homeY - pt.y;
          const offDist = offX * offX + offY * offY;

          if (offDist > 0.5 || Math.abs(pt.vx) > 0.1 || Math.abs(pt.vy) > 0.1) {
            pt.vx += offX * SPRING_K;
            pt.vy += offY * SPRING_K;
            pt.vx *= DAMPING;
            pt.vy *= DAMPING;
            pt.x += pt.vx;
            pt.y += pt.vy;

            if (!pt.displaced) {
              pt.displaced = true;
              needsStaticRedraw.current = true;
            }
            anyDisplaced = true;
          } else if (pt.displaced) {
            // Snap home
            pt.x = pt.homeX;
            pt.y = pt.homeY;
            pt.vx = 0;
            pt.vy = 0;
            pt.displaced = false;
            needsStaticRedraw.current = true;
          }
        }

        // Redraw static layer if needed
        if (needsStaticRedraw.current) {
          drawStatic();
        }

        // Composite: static bg + displaced particles on top
        ctx.clearRect(0, 0, canvasSize.current.w, canvasSize.current.h);
        ctx.drawImage(staticCanvas.current!, 0, 0);

        if (anyDisplaced) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.scale(z, z);
          ctx.font = `${fontSize}px monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          for (let i = 0; i < ps.length; i++) {
            const pt = ps[i];
            if (!pt.displaced) continue;
            const gray = Math.min(255, Math.round((255 - pt.brightness) * 1.3));
            if (gray < 8) continue;
            ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
            ctx.fillText(showBinary ? pt.binaryChar : pt.baseChar, pt.x, pt.y);
          }
          ctx.restore();
        }

        raf.current = requestAnimationFrame(animate);
      }

      raf.current = requestAnimationFrame(animate);
    };

    return () => cancelAnimationFrame(raf.current);
  }, [imageSrc, screenToCanvas]);

  return (
    <div
      ref={containerRef}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: "grab", overflow: "hidden" }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
