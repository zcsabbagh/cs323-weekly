import Link from "next/link";

export default function StudentLanding() {
  return (
    <div className="min-h-screen flex items-center justify-center px-8">
      <div className="text-center space-y-4 max-w-sm">
        <h1 className="text-xl font-light">Student Access</h1>
        <p className="text-sm text-muted-foreground">
          Your teacher will share a specific interview link with you.
          Check your email or course page for your assignment link.
        </p>
        <Link
          href="/"
          className="inline-block text-xs text-muted-foreground hover:text-foreground transition-colors border-b border-border pb-0.5"
        >
          &larr; Back
        </Link>
      </div>
    </div>
  );
}
