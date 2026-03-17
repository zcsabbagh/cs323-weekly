import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-6">
        <h1 className="font-serif text-4xl font-medium tracking-tight text-foreground">
          CS 323 Weekly
        </h1>
        <p className="text-muted-foreground font-serif text-lg">
          Reading discussion interviews
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/teacher"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Teacher Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
