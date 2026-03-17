"use client";

import Link from "next/link";
import { AsciiHero } from "./ascii-hero";
import { useEffect, useState } from "react";

export default function Home() {
  const [shimmer, setShimmer] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => {
      setShimmer(true);
      const t2 = setTimeout(() => setShimmer(false), 1000);

      const interval = setInterval(() => {
        setShimmer(true);
        setTimeout(() => setShimmer(false), 1000);
      }, 3000);

      return () => {
        clearTimeout(t2);
        clearInterval(interval);
      };
    }, 2000);

    return () => clearTimeout(t1);
  }, []);

  return (
    <div className="h-screen w-screen bg-black relative overflow-hidden">
      <AsciiHero />

      <div className="absolute inset-0 pointer-events-none z-10">
        <div className="absolute top-8 right-8 flex gap-3 pointer-events-auto">
          <Link
            href="/student"
            className="px-6 py-2.5 text-sm text-white/80 bg-white/5 hover:bg-white/10 border border-white/15 hover:border-white/30 rounded-full transition-all"
          >
            Student
          </Link>
          <Link
            href="/teacher"
            className="px-6 py-2.5 text-sm text-white bg-white/10 hover:bg-white/15 border-2 border-white/30 hover:border-white/50 rounded-full transition-all font-medium"
          >
            Teacher
          </Link>
        </div>

        <div className="absolute bottom-10 left-10 md:bottom-14 md:left-14">
          <h1
            className={`text-7xl md:text-9xl font-extralight tracking-tighter leading-none ${
              shimmer ? "title-shimmer" : "text-white/90"
            }`}
          >
            CS 323
          </h1>
          <p className="text-2xl md:text-3xl font-extralight text-white/35 mt-1 tracking-tight">
            The AI Awakening
          </p>
        </div>
      </div>
    </div>
  );
}
