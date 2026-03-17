import Link from "next/link";
import { AsciiHero } from "./ascii-hero";

export default function Home() {
  return (
    <div className="h-screen w-screen bg-black relative overflow-hidden">
      {/* Full-screen ASCII art */}
      <AsciiHero />

      {/* Top-right CTA buttons */}
      <div className="absolute top-8 right-8 z-10 flex gap-3">
        <Link
          href="/teacher"
          className="px-5 py-2 text-xs font-medium text-white bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40 rounded-md transition-all backdrop-blur-sm"
        >
          Teacher
        </Link>
        <Link
          href="/student"
          className="px-5 py-2 text-xs font-medium text-black bg-white hover:bg-white/90 rounded-md transition-all"
        >
          Student
        </Link>
      </div>

      {/* Bottom-left anchored title */}
      <div className="absolute bottom-10 left-10 md:bottom-14 md:left-14 pointer-events-none z-10">
        <h1 className="text-7xl md:text-9xl font-extralight tracking-tighter text-white/90 leading-none">
          CS 323
        </h1>
        <p className="text-2xl md:text-3xl font-extralight text-white/40 mt-1 tracking-tight">
          The AI Awakening
        </p>
      </div>
    </div>
  );
}
