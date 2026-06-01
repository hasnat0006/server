"use client";

import { useEffect, useMemo, useState } from "react";

const DEFAULT_API_BASE = "http://localhost:5000";
const ANALYSIS_STEPS = [
  "Uploading document",
  "Reading document text",
  "Checking for duplicate content",
  "Running AI verification",
  "Recording on blockchain",
  "Finalizing result",
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildWordSet(text) {
  const words = (text || "")
    .toLowerCase()
    .match(/[a-z0-9]{2,}/g);

  if (!words) return new Set();

  return new Set(words);
}

function highlightOverlap(text, referenceText) {
  if (!text) return text;

  const wordSet = buildWordSet(referenceText);
  if (!wordSet.size) return text;

  const words = Array.from(wordSet)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);

  if (!words.length) return text;

  const regex = new RegExp(`\\b(${words.join("|")})\\b`, "gi");
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (wordSet.has(part.toLowerCase())) {
      return (
        <mark key={index} className="rounded-sm bg-yellow-200 px-0.5 text-slate-900">
          {part}
        </mark>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export default function Home() {
  const [file, setFile] = useState(null);
  const [documentType, setDocumentType] = useState("general");
  const [uploaderName, setUploaderName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [failureDetails, setFailureDetails] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);

  const apiBase = useMemo(() => {
    return (process.env.NEXT_PUBLIC_SERVER_URL || DEFAULT_API_BASE).replace(/\/$/, "");
  }, []);

  useEffect(() => {
    if (!isSubmitting) {
      return;
    }

    setActiveStep(0);
    setProgressPercent(8);

    const intervalId = setInterval(() => {
      setActiveStep((previousStep) => {
        if (previousStep >= ANALYSIS_STEPS.length - 1) {
          return previousStep;
        }
        return previousStep + 1;
      });

      setProgressPercent((previousProgress) => {
        const next = previousProgress + 14;
        return next > 92 ? 92 : next;
      });
    }, 1100);

    return () => clearInterval(intervalId);
  }, [isSubmitting]);

  async function handleUpload(event) {
    event.preventDefault();
    setError("");
    setResult(null);
    setFailureDetails(null);
    setActiveStep(0);
    setProgressPercent(0);

    if (!file) {
      setError("Please choose a file before uploading.");
      return;
    }

    const formData = new FormData();
    formData.append("document", file);
    formData.append("documentType", documentType);
    formData.append("uploaderName", uploaderName || "Anonymous");

    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiBase}/api/document/upload`, {
        method: "POST",
        body: formData,
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok || !payload.success) {
        setFailureDetails(payload);
        const reason = payload?.message || payload?.error || `Upload failed (HTTP ${response.status})`;
        const duplicateName = payload?.duplicateDocument?.name;
        const duplicateTime = payload?.duplicateDocument?.uploadedAt;

        let detailedReason = reason;
        if (duplicateName || duplicateTime) {
          detailedReason += "\n\nExisting record:";
          if (duplicateName) detailedReason += `\n- Name: ${duplicateName}`;
          if (duplicateTime) detailedReason += `\n- Uploaded: ${new Date(duplicateTime).toLocaleString()}`;
        }

        throw new Error(detailedReason);
      }

      setResult(payload);
      setProgressPercent(100);
      setActiveStep(ANALYSIS_STEPS.length - 1);
    } catch (uploadError) {
      setProgressPercent(100);
      setError(uploadError.message || "Upload failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  const analysis = result?.data?.xaiAnalysis || result?.data?.verification || {};
  const status = analysis?.status || "unknown";
  const confidence = analysis?.confidenceScore;
  const documentHash = analysis?.documentHash || result?.data?.documentHash || "n/a";
  const transactionHash =
    result?.data?.blockchain?.transactionHash || result?.data?.blockchain?.txHash || "not available";
  const resultMessage =
    result?.data?.message ||
    (status === "verified" ? "Document verified successfully." : "Analysis complete.");
  const isVerified = status === "verified";
  const decisionTitle = isVerified ? "Approved" : "Needs Review";
  const decisionDescription = isVerified
    ? "No risky duplication found. Document is accepted and stored."
    : "Potential duplication was found. Please review the matched sections.";
  const exactMatch = failureDetails?.similarity?.exactMatch || failureDetails?.exactMatch || null;
  const comparisonMatches = failureDetails?.similarity?.fuzzyMatches || exactMatch?.matches || [];

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-4 px-4 pb-16 pt-10 sm:px-6">
      <section className="rounded-2xl border border-emerald-100/80 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Document Verification</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">Simple Upload Console</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-600 sm:text-base">
          Upload once, then review AI and blockchain verification in one clean view.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <form className="grid gap-4" onSubmit={handleUpload}>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-700">Document</span>
            <input
              type="file"
              name="document"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-100"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              required
            />
            <small className="text-xs text-slate-500">
              {file ? `Selected: ${file.name}` : "Choose PDF, DOCX, TXT, XLSX, or ZIP."}
            </small>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">Document type</span>
              <select
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                value={documentType}
                onChange={(event) => setDocumentType(event.target.value)}
              >
                <option value="general">General</option>
                <option value="certificate">Certificate</option>
                <option value="report">Report</option>
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">Uploader name</span>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                placeholder="e.g. Hasnat"
                value={uploaderName}
                onChange={(event) => setUploaderName(event.target.value)}
              />
            </label>
          </div>

          <button
            className="rounded-xl bg-gradient-to-r from-emerald-700 to-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:translate-y-[-1px] hover:shadow-md disabled:cursor-wait disabled:opacity-70"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Analyzing your file..." : "Upload and Analyze"}
          </button>
          <p className="text-xs text-slate-500">API: {apiBase}</p>
        </form>
      </section>

      {isSubmitting ? (
        <section className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-900">Analysis in progress</h2>
            <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
              {progressPercent}% complete
            </span>
          </div>

          <p className="mt-2 text-sm text-slate-600">
            Please wait. We are processing your document and checking it against existing records.
          </p>

          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-teal-500 transition-all duration-700"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <ol className="mt-4 grid gap-2">
            {ANALYSIS_STEPS.map((step, index) => {
              const isCompleted = index < activeStep;
              const isCurrent = index === activeStep;

              return (
                <li
                  key={step}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                    isCompleted
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : isCurrent
                        ? "border-sky-200 bg-sky-50 text-sky-800"
                        : "border-slate-200 bg-slate-50 text-slate-500"
                  }`}
                >
                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${
                    isCompleted
                      ? "bg-emerald-600 text-white"
                      : isCurrent
                        ? "bg-sky-600 text-white"
                        : "bg-slate-300 text-slate-700"
                  }`}>
                    {isCompleted ? "✓" : index + 1}
                  </span>
                  <span className={isCurrent ? "font-medium" : ""}>{step}</span>
                  {isCurrent ? <span className="ml-auto text-xs animate-pulse">Working...</span> : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {error ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-rose-800">Upload Failed</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-rose-700">{error}</p>

          {exactMatch?.documents?.length ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Exact Match Summary</h3>
              <p className="mt-1 text-xs text-slate-600">
                Total exact matches: {exactMatch.totalExactMatches ?? exactMatch.matches?.length ?? 0}
              </p>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {exactMatch.documents.slice(0, 10).map((doc) => (
                  <li key={doc.documentId}>
                    • {doc.documentName} (Document ID: {doc.documentId}) - exact sections: {doc.exactSections}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {exactMatch?.existingDocument ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-white p-4 text-sm text-slate-700">
              <h3 className="font-semibold text-slate-900">Exact Hash Match</h3>
              <p className="mt-1">Uploaded: {exactMatch.uploadedDocument?.name}</p>
              <p>Existing: {exactMatch.existingDocument?.name}</p>
              <p className="break-all font-mono text-xs text-slate-600">Hash: {exactMatch.uploadedDocument?.hash}</p>
            </div>
          ) : null}

          {comparisonMatches.length ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Matched Text Comparison</h3>
              <p className="mt-1 text-xs text-slate-600">
                Showing top {Math.min(5, comparisonMatches.length)} matched sections (uploaded vs database)
              </p>

              <div className="mt-3 space-y-3">
                {comparisonMatches.slice(0, 5).map((match, idx) => (
                  <article key={`${match.yourSection || idx}-${match.matchedSection || idx}`} className="rounded-xl border border-slate-200 p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                      <span className="font-medium text-slate-800">Match #{idx + 1}</span>
                      <span>Uploaded section: {match.yourSection ?? "n/a"}</span>
                      <span>DB section: {match.matchedSection ?? "n/a"}</span>
                      <span>DB doc: {match.matchedDocument || "Unknown"}</span>
                      {typeof match.similarity === "number" ? (
                        <span>Similarity: {(match.similarity * 100).toFixed(1)}%</span>
                      ) : null}
                      {match.similarityMode ? <span>Mode: {match.similarityMode}</span> : null}
                      {typeof match.embeddingSimilarity === "number" ? (
                        <span>Embedding: {(match.embeddingSimilarity * 100).toFixed(1)}%</span>
                      ) : null}
                      {typeof match.trigramSimilarity === "number" ? (
                        <span>Trigram: {(match.trigramSimilarity * 100).toFixed(1)}%</span>
                      ) : null}
                      {typeof match.lexicalSimilarity === "number" ? (
                        <span>Lexical: {(match.lexicalSimilarity * 100).toFixed(1)}%</span>
                      ) : null}
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">Uploaded Text</p>
                        <p className="max-h-40 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                          {match.yourText
                            ? highlightOverlap(match.yourText, match.matchedText || "")
                            : "(No uploaded text provided in response)"}
                        </p>
                      </div>

                      <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">Database Text</p>
                        <p className="max-h-40 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                          {match.matchedText
                            ? highlightOverlap(match.matchedText, match.yourText || "")
                            : "(No database text provided in response)"}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {result ? (
        <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-semibold text-slate-900">Final Result</h2>
          <p className="mt-2 text-sm text-slate-600">{resultMessage}</p>

          <article className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Plain-English Summary</h3>
            <p className="mt-2 text-xl font-semibold text-slate-900">{decisionTitle}</p>
            <p className="mt-1 text-sm text-slate-600">{decisionDescription}</p>
          </article>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Decision</h3>
              <p className="mt-1.5 text-base font-semibold text-slate-900">{isVerified ? "Accepted" : "Rejected"}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Confidence</h3>
              <p className="mt-1.5 text-base font-semibold text-slate-900">{confidence ?? "n/a"}%</p>
            </article>
          </div>

          <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">Show technical details</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <article className="rounded-lg border border-slate-200 bg-white p-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Internal status</h3>
                <p className="mt-1.5 text-sm font-semibold text-slate-900">{status}</p>
              </article>
              <article className="rounded-lg border border-slate-200 bg-white p-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Document hash</h3>
                <p className="mt-1.5 break-all font-mono text-xs text-slate-900">{documentHash}</p>
              </article>
              <article className="rounded-lg border border-slate-200 bg-white p-3 md:col-span-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Blockchain transaction</h3>
                <p className="mt-1.5 break-all font-mono text-xs text-slate-900">{transactionHash}</p>
              </article>
            </div>
          </details>
        </section>
      ) : null}
    </main>
  );
}
