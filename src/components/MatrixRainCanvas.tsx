import React, { useEffect, useRef } from 'react';

interface MatrixRainCanvasProps {
  enabled?: boolean;
  prominent?: boolean;
}

const MATRIX_DIGITS = '01234567890123456789010189472635';

export const MatrixRainCanvas: React.FC<MatrixRainCanvasProps> = ({
  enabled = true,
  prominent = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const fontSize = prominent ? 16 : 15;
    let columns = 0;
    let drops: number[] = [];
    let speeds: number[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const nextCols = Math.max(1, Math.floor(width / fontSize));
      const rows = Math.ceil(height / fontSize);
      const nextDrops: number[] = [];
      const nextSpeeds: number[] = [];
      for (let i = 0; i < nextCols; i++) {
        nextDrops[i] = drops[i] ?? Math.floor(Math.random() * (rows + 12)) - 10;
        nextSpeeds[i] = speeds[i] ?? 0.5 + Math.random() * 0.9;
      }
      columns = nextCols;
      drops = nextDrops;
      speeds = nextSpeeds;

      ctx.fillStyle = '#020603';
      ctx.fillRect(0, 0, width, height);
    };

    resize();
    window.addEventListener('resize', resize);

    if (!enabled) {
      ctx.fillStyle = '#020603';
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      return () => window.removeEventListener('resize', resize);
    }

    if (prefersReducedMotion) {
      const width = window.innerWidth;
      const height = window.innerHeight;
      ctx.fillStyle = '#020603';
      ctx.fillRect(0, 0, width, height);
      ctx.font = `600 ${fontSize}px "JetBrains Mono", ui-monospace, monospace`;
      for (let i = 0; i < columns; i++) {
        if (i % 2 !== 0) continue;
        const maxRow = Math.floor(height / fontSize);
        for (let r = 1; r < maxRow; r += 3) {
          const ch = MATRIX_DIGITS[Math.floor(Math.random() * MATRIX_DIGITS.length)];
          ctx.fillStyle =
            r % 9 === 1
              ? prominent
                ? 'rgba(134, 239, 172, 0.55)'
                : 'rgba(134, 239, 172, 0.35)'
              : prominent
              ? 'rgba(34, 197, 94, 0.3)'
              : 'rgba(34, 197, 94, 0.18)';
          ctx.fillText(ch, i * fontSize, r * fontSize);
        }
      }
      return () => window.removeEventListener('resize', resize);
    }

    let rafId = 0;
    let lastTick = 0;
    const frameIntervalMs = 42;

    const draw = (now: number) => {
      rafId = window.requestAnimationFrame(draw);
      if (now - lastTick < frameIntervalMs) return;
      lastTick = now;

      const width = window.innerWidth;
      const height = window.innerHeight;

      ctx.fillStyle = prominent ? 'rgba(2, 6, 3, 0.065)' : 'rgba(2, 6, 3, 0.08)';
      ctx.fillRect(0, 0, width, height);

      ctx.font = `600 ${fontSize}px "JetBrains Mono", ui-monospace, monospace`;

      for (let i = 0; i < columns; i++) {
        const yRow = Math.floor(drops[i]);
        const yPx = yRow * fontSize;
        const xPx = i * fontSize;

        if (yPx >= 0 && yPx <= height + fontSize) {
          const leadChar = MATRIX_DIGITS[Math.floor(Math.random() * MATRIX_DIGITS.length)];
          ctx.fillStyle = prominent ? '#DCFCE7' : '#BBF7D0';
          ctx.fillText(leadChar, xPx, yPx);

          if (yRow > 1) {
            const trailChar = MATRIX_DIGITS[Math.floor(Math.random() * MATRIX_DIGITS.length)];
            ctx.fillStyle = prominent ? '#4ADE80' : '#22C55E';
            ctx.fillText(trailChar, xPx, (yRow - 1) * fontSize);
          }
        }

        if (yPx > height && Math.random() > 0.965) {
          drops[i] = Math.floor(Math.random() * -12);
          speeds[i] = 0.5 + Math.random() * 0.9;
        } else {
          drops[i] += speeds[i];
        }
      }
    };

    rafId = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [enabled, prominent]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`fixed inset-0 z-0 pointer-events-none ${
        prominent ? 'opacity-95' : 'opacity-65'
      }`}
    />
  );
};
