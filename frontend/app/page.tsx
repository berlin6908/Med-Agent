import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Drug Leaflet Agent
        </h1>
        <p className="mt-6 text-lg text-gray-600 dark:text-gray-300">
          Upload a photo or PDF of a drug leaflet and ask questions about
          dosage, side effects, contraindications, and interactions — answers
          are grounded in your own uploaded documents.
        </p>

        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href="/dashboard"
            className="rounded-md bg-brand-600 px-5 py-2.5 text-white hover:bg-brand-700 transition"
          >
            Get started
          </Link>
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-gray-300 px-5 py-2.5 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 transition"
          >
            API docs
          </a>
        </div>

        <p className="mt-12 text-xs text-gray-500">
          Information only — not medical advice. Always consult a qualified
          physician or pharmacist.
        </p>
      </div>
    </main>
  );
}
