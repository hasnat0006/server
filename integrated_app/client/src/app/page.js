"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

function highlightOverlap(text, referenceText, MIN_PHRASE = 3, markClass = 'bg-yellow-200') {
  if (!text || !referenceText) return text;

  // Build reference n-gram set
  const refWords = (referenceText || '').toLowerCase().match(/\b\w+\b/g) || [];
  if (refWords.length < MIN_PHRASE) return text;

  const refNGrams = new Set();
  for (let i = 0; i <= refWords.length - MIN_PHRASE; i++) {
    refNGrams.add(refWords.slice(i, i + MIN_PHRASE).join(' '));
  }

  // Find source word positions that are in a matching n-gram
  const srcWords = (text || '').toLowerCase().match(/\b\w+\b/g) || [];
  if (srcWords.length < MIN_PHRASE) return text;

  const matchedPositions = new Set();
  for (let i = 0; i <= srcWords.length - MIN_PHRASE; i++) {
    const ngram = srcWords.slice(i, i + MIN_PHRASE).join(' ');
    if (refNGrams.has(ngram)) {
      for (let j = i; j < i + MIN_PHRASE; j++) matchedPositions.add(j);
    }
  }

  if (matchedPositions.size === 0) return text;

  // Walk through the original text word-by-word, highlighting matched positions
  const wordRegex = /\b\w+\b/g;
  const parts = [];
  let lastIndex = 0;
  let wordIdx = 0;
  let match;

  while ((match = wordRegex.exec(text)) !== null) {
    const wordStart = match.index;
    const wordEnd = wordRegex.lastIndex;

    // Non-word text before this word
    if (wordStart > lastIndex) {
      parts.push(text.slice(lastIndex, wordStart));
    }

    if (matchedPositions.has(wordIdx)) {
      parts.push(
        <mark key={`m${wordIdx}`} className={`rounded-sm ${markClass} px-0.5 text-slate-900`}>
          {text.slice(wordStart, wordEnd)}
        </mark>
      );
    } else {
      parts.push(text.slice(wordStart, wordEnd));
    }

    lastIndex = wordEnd;
    wordIdx++;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

export default function Home() {
  const [file, setFile] = useState(null);
  const [documentType, setDocumentType] = useState("general");
  const [uploaderName, setUploaderName] = useState("");
  const [title, setTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [failureDetails, setFailureDetails] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) setFile(droppedFile);
  }, []);

  const handleDropZoneClick = () => {
    fileInputRef.current?.click();
  };

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

    if (!title.trim()) {
      setError("Please enter a document title.");
      return;
    }

    if (!uploaderName.trim()) {
      setError("Please enter the author(s) name.");
      return;
    }

    const formData = new FormData();
    formData.append("document", file);
    formData.append("documentType", documentType);
    formData.append("uploaderName", uploaderName || "Anonymous");
    formData.append("title", title || "");

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
  const transactionHash =
    result?.data?.blockchain?.transactionHash || result?.data?.blockchain?.txHash || "not available";
  const resultMessage =
    result?.data?.message ||
    (status === "verified" ? "Document verified successfully." : "Analysis complete.");
  const isVerified = status === "verified";
  const exactMatch = failureDetails?.similarity?.exactMatch || failureDetails?.exactMatch || null;
  const comparisonMatches =
    failureDetails?.similarity?.fuzzyMatches || failureDetails?.similarity?.rawTopMatches || exactMatch?.matches || [];
  const authorship = result?.data?.authorship || null;
  const successSimilarity = result?.data?.similarity || null;
  const mapSectionCount = successSimilarity?.originalChunkCount || successSimilarity?.totalSections || 0;
  if (typeof window !== "undefined" && successSimilarity) {
    console.log(`🗺️  Section map input: originalChunkCount=${successSimilarity.originalChunkCount}, totalSections=${successSimilarity.totalSections}, mapSectionCount=${mapSectionCount}`);
  }
  const authorshipLevelStyle = !authorship
    ? { badge: "bg-slate-100 text-slate-700 ring-slate-300", bar: "bg-slate-400" }
    : authorship.authorshipLevel === "High"
    ? { badge: "bg-emerald-100 text-emerald-700 ring-emerald-300", bar: "bg-emerald-500" }
    : authorship.authorshipLevel === "Moderate"
    ? { badge: "bg-amber-100 text-amber-700 ring-amber-300", bar: "bg-amber-500" }
    : { badge: "bg-rose-100 text-rose-700 ring-rose-300", bar: "bg-rose-500" };

  const rejectionAuthorship = failureDetails?.authorship || null;
  const rejectionSimilarity = failureDetails?.similarity || null;
  const rejectionMapSectionCount = rejectionSimilarity?.originalChunkCount || rejectionSimilarity?.totalSections || 0;
  const rejectionAuthorshipLevelStyle = !rejectionAuthorship
    ? { badge: "bg-slate-100 text-slate-700 ring-slate-300", bar: "bg-slate-400" }
    : rejectionAuthorship.authorshipLevel === "High"
    ? { badge: "bg-emerald-100 text-emerald-700 ring-emerald-300", bar: "bg-emerald-500" }
    : rejectionAuthorship.authorshipLevel === "Moderate"
    ? { badge: "bg-amber-100 text-amber-700 ring-amber-300", bar: "bg-amber-500" }
    : { badge: "bg-rose-100 text-rose-700 ring-rose-300", bar: "bg-rose-500" };

  function severityColors(sim) {
    if (sim >= 0.8) return { label: "High", border: "border-red-300", bg: "bg-red-50", badge: "bg-red-100 text-red-700 ring-red-300" };
    if (sim >= 0.5) return { label: "Medium", border: "border-amber-300", bg: "bg-amber-50", badge: "bg-amber-100 text-amber-700 ring-amber-300" };
    return { label: "Low", border: "border-yellow-200", bg: "bg-yellow-50", badge: "bg-yellow-100 text-yellow-700 ring-yellow-200" };
  }

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-4 px-4 pb-16 pt-10 sm:px-6">
      <section className="rounded-2xl border border-emerald-100/80 bg-white/80 p-4 shadow-sm backdrop-blur-sm text-center">
        <p className="text-[30px] font-bold uppercase tracking-[0.05em] text-emerald-700">Document Verification</p>
        <p className="mx-auto mt-1 max-w-xl text-sm text-slate-500 sm:text-base">
          Upload once, then review AI and blockchain verification in one clean view.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <form className="grid gap-4" onSubmit={handleUpload}>
          <div
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition ${
              isDragOver
                ? "border-emerald-500 bg-emerald-50"
                : "border-slate-300 bg-white hover:border-emerald-400 hover:bg-emerald-50/50"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleDropZoneClick}
          >
            <input
              ref={fileInputRef}
              type="file"
              name="document"
              className="hidden"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              required
            />
            <svg
              className={`mb-3 h-10 w-10 ${isDragOver ? "text-emerald-600" : "text-slate-400"}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6h.1a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            {file ? (
              <div>
                <p className="text-sm font-medium text-slate-900">{file.name}</p>
                <p className="mt-1 text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-slate-700">
                  Drop your document here, or click to browse
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  PDF, DOCX, TXT, XLSX, or ZIP (max 50 MB)
                </p>
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">Title</span>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                placeholder="e.g. Research Paper Title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">Document type</span>
              <select
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                value={documentType}
                onChange={(event) => setDocumentType(event.target.value)}
              >
                <option value="general">General</option>
                <option value="certificate">Certificate</option>
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">Authors</span>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                placeholder="e.g. Hasnat"
                value={uploaderName}
                onChange={(event) => setUploaderName(event.target.value)}
                required
              />
            </label>
          </div>

          <button
            className="rounded-xl bg-gradient-to-r from-emerald-700 to-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:translate-y-[-1px] hover:shadow-md disabled:cursor-wait disabled:opacity-70"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Analyzing your file..." : "Analyze and Upload"}
          </button>
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

      {failureDetails ? (
        <section className="rounded-2xl border border-rose-300 bg-gradient-to-br from-white via-rose-50/40 to-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-900">Final Result</h2>
            <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-300">
              Rejected
            </span>
          </div>
          <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
            {failureDetails.message || error}
          </p>

          {exactMatch?.existingDocument ? (
            <article className="mt-4 rounded-xl border border-rose-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Duplicate Document Detected</h3>
              <p className="mt-1 text-xs text-slate-600">
                This document's content has already been stored and verified.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Uploaded</p>
                  <p className="mt-1 text-sm text-slate-800">{exactMatch.uploadedDocument?.name}</p>
                  <p className="break-all font-mono text-[10px] text-slate-500">Hash: {exactMatch.uploadedDocument?.hash}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Existing</p>
                  <p className="mt-1 text-sm text-slate-800">{exactMatch.existingDocument?.name}</p>
                  <p className="text-[10px] text-slate-500">Document ID: {exactMatch.existingDocument?.documentId}</p>
                </div>
              </div>
            </article>
          ) : null}

          {exactMatch?.documents?.length ? (
            <article className="mt-4 rounded-xl border border-rose-200 bg-white p-4">
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
            </article>
          ) : null}

          {rejectionAuthorship ? (
            <article className="mt-4 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-rose-50/40 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Authorship Analysis</h3>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${rejectionAuthorshipLevelStyle.badge}`}>
                  {rejectionAuthorship.authorshipLevel} authorship
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-3xl font-bold text-rose-700">{rejectionAuthorship.originalPercentage}%</p>
                <span className="text-sm text-slate-600">original content</span>
                <span className="text-xs text-slate-500">
                  · {rejectionAuthorship.matchedPercentage}% matched with database
                </span>
              </div>

              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200/70">
                <div
                  className={`h-full rounded-full ${rejectionAuthorshipLevelStyle.bar} transition-all`}
                  style={{ width: `${rejectionAuthorship.originalPercentage}%` }}
                />
              </div>

              {rejectionSimilarity && rejectionMapSectionCount > 0 ? (
                <div className="mt-4">
                  <div className="flex items-baseline justify-between">
                    <p className="text-xs font-semibold text-slate-700">Document Section Map</p>
                    <p className="text-[10px] text-slate-500">
                      {rejectionMapSectionCount} section{rejectionMapSectionCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="mt-1.5 rounded-md border border-slate-200 bg-slate-50 p-1.5">
                    <div
                      className="grid gap-0.5"
                      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(12px, 1fr))" }}
                    >
                      {Array.from({ length: rejectionMapSectionCount }, (_, i) => i + 1).map((secNum) => {
                        const matches = rejectionSimilarity.perSectionMatches?.[secNum] || [];
                        const isMatched = matches.length > 0;
                        const topSim = isMatched ? matches[0].similarity || 0 : 0;
                        let bgClass = "bg-emerald-300";
                        let title = `Section ${secNum} — Original`;
                        if (isMatched) {
                          if (topSim >= 0.8) bgClass = "bg-rose-500";
                          else if (topSim >= 0.5) bgClass = "bg-amber-400";
                          else bgClass = "bg-yellow-300";
                          title = `Section ${secNum} — ${(topSim * 100).toFixed(0)}% overlap`;
                        }
                        return (
                          <div
                            key={`rej-map-${secNum}`}
                            className={`${bgClass} h-3.5 w-full cursor-help rounded-sm transition hover:brightness-110 hover:ring-1 hover:ring-slate-500`}
                            title={title}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-4 rounded-sm bg-emerald-300 ring-1 ring-emerald-400/50" />
                      <span>Original</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-4 rounded-sm bg-yellow-300 ring-1 ring-yellow-400/50" />
                      <span>Low overlap</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-4 rounded-sm bg-amber-400 ring-1 ring-amber-500/50" />
                      <span>Medium overlap</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-4 rounded-sm bg-rose-500 ring-1 ring-rose-600/50" />
                      <span>High overlap</span>
                    </span>
                  </div>
                </div>
              ) : null}

              <p className="mt-3 text-xs text-slate-600">
                {rejectionAuthorship.totalSections > 0 ? (
                  <>
                    {rejectionAuthorship.originalSections} of {rejectionAuthorship.totalSections} section{rejectionAuthorship.totalSections === 1 ? "" : "s"} accepted as original.
                    {rejectionAuthorship.matchedSections > 0
                      ? ` ${rejectionAuthorship.matchedSections} section${rejectionAuthorship.matchedSections === 1 ? "" : "s"} flagged with existing documents.`
                      : " No sections flagged."}
                  </>
                ) : (
                  "Document text was too short to perform section-level analysis."
                )}
              </p>

              {rejectionAuthorship.contributors && rejectionAuthorship.contributors.length > 0 ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-slate-700">Contributing documents</p>
                  <ul className="mt-1.5 space-y-1.5 text-xs text-slate-600">
                    {rejectionAuthorship.contributors.slice(0, 5).map((c) => (
                      <li key={c.documentId} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span className="font-medium text-slate-800">{c.documentName}</span>
                        {c.authors ? <span className="text-slate-500">by {c.authors}</span> : null}
                        <span className="text-slate-400">·</span>
                        <span>{c.similarSections} section{c.similarSections === 1 ? "" : "s"}</span>
                        <span className="text-slate-400">·</span>
                        <span>avg {c.averageSimilarity}</span>
                        <span className="text-slate-400">·</span>
                        <span>{c.contributionPercentage}% of document</span>
                      </li>
                    ))}
                    {rejectionAuthorship.contributors.length > 5 ? (
                      <li className="text-slate-500">+ {rejectionAuthorship.contributors.length - 5} more contributor(s)</li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
            </article>
          ) : null}

          {rejectionSimilarity && rejectionSimilarity.perSectionMatches && Object.keys(rejectionSimilarity.perSectionMatches).length > 0 ? (
            <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                Show matched sections ({Object.keys(rejectionSimilarity.perSectionMatches).length})
              </summary>
              <p className="mt-1 text-xs text-slate-600">
                These sections exceeded the similarity threshold with previously stored documents.
              </p>
              <div className="mt-3 space-y-4">
                {Object.keys(rejectionSimilarity.perSectionMatches).map((secKey) => {
                  const secIndex = Number(secKey);
                  const matches = rejectionSimilarity.perSectionMatches[secKey] || [];
                  const topSim = matches.reduce((max, m) => Math.max(max, m.similarity || 0), 0);
                  const topColor = severityColors(topSim);
                  return (
                    <div key={`rej-sec-${secKey}`} className="rounded-xl border border-slate-200 p-3">
                      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">Section {secIndex}</span>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5">
                          {matches.length} match{matches.length > 1 ? "es" : ""}
                        </span>
                        {topSim > 0 ? (
                          <span className={`rounded-full px-2 py-0.5 font-medium ring-1 ${topColor.badge}`}>
                            {topColor.label} overlap
                          </span>
                        ) : null}
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                            Uploaded Document
                          </p>
                          <p className="max-h-36 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                            {matches[0]?.yourText || "(No uploaded text provided)"}
                          </p>
                        </div>
                        <div className="space-y-2">
                          {matches.map((m, i) => {
                            const severity = severityColors(m.similarity || 0);
                            return (
                              <div key={`${secKey}-m-${i}`} className={`rounded-lg border ${severity.border} ${severity.bg} p-3`}>
                                <div className="mb-1.5">
                                  <p className="line-clamp-1 text-xs font-semibold text-slate-800" title={m.matchedTitle || m.matchedDocument}>
                                    {m.matchedTitle || m.matchedDocument || "Unknown"}
                                  </p>
                                  {m.matchedAuthors ? (
                                    <p className="truncate text-[10px] text-slate-500">
                                      <span className="text-slate-400">Author:</span> {m.matchedAuthors}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[10px]">
                                  <span className={`font-semibold ${severity.badge.split(" ").slice(0, 2).join(" ")}`}>
                                    {((m.similarity || 0) * 100).toFixed(1)}%
                                  </span>
                                  <span className="text-slate-500">match</span>
                                  <span className={`rounded-full px-1.5 py-0.5 font-medium ring-1 ${severity.badge}`}>
                                    {severity.label}
                                  </span>
                                </div>
                                <p className="max-h-32 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                                  {m.matchedText ? highlightOverlap(m.matchedText, matches[0]?.yourText || "", 3) : "(No DB text)"}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}
        </section>
      ) : error ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-rose-800">Upload Failed</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-rose-700">{error}</p>
        </section>
      ) : null}

      {result ? (
        <section className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${isVerified ? "border-emerald-300 bg-gradient-to-br from-white via-emerald-50/40 to-white" : "border-slate-200 bg-white"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-900">Final Result</h2>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${isVerified ? "bg-emerald-100 text-emerald-700 ring-emerald-300" : "bg-rose-100 text-rose-700 ring-rose-300"}`}>
              {isVerified ? "Accepted" : "Rejected"}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-600">{resultMessage}</p>

          {authorship ? (
            <article className="mt-4 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-emerald-50/40 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Authorship Analysis</h3>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${authorshipLevelStyle.badge}`}>
                  {authorship.authorshipLevel} authorship
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-3xl font-bold text-emerald-700">{authorship.originalPercentage}%</p>
                <span className="text-sm text-slate-600">original content</span>
                <span className="text-xs text-slate-500">
                  · {authorship.matchedPercentage}% matched with database
                </span>
              </div>

              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200/70">
                <div
                  className={`h-full rounded-full ${authorshipLevelStyle.bar} transition-all`}
                  style={{ width: `${authorship.originalPercentage}%` }}
                />
              </div>

              {successSimilarity && mapSectionCount > 0 ? (
                <div className="mt-4">
                  <div className="flex items-baseline justify-between">
                    <p className="text-xs font-semibold text-slate-700">Document Section Map</p>
                    <p className="text-[10px] text-slate-500">
                      {mapSectionCount} section{mapSectionCount === 1 ? "" : "s"}
                      {/* {successSimilarity.originalChunkCount && successSimilarity.totalSections < successSimilarity.originalChunkCount
                        ? ` · ${successSimilarity.totalSections} analyzed`
                        : ""} */}
                    </p>
                  </div>
                  <div className="mt-1.5 rounded-md border border-slate-200 bg-slate-50 p-1.5">
                    <div
                      className="grid gap-0.5"
                      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(12px, 1fr))" }}
                    >
                      {Array.from({ length: mapSectionCount }, (_, i) => i + 1).map((secNum) => {
                        const matches = successSimilarity.perSectionMatches?.[secNum] || [];
                        const isMatched = matches.length > 0;
                        const topSim = isMatched ? matches[0].similarity || 0 : 0;
                        let bgClass = "bg-emerald-300";
                        let title = `Section ${secNum} — Original (accepted)`;
                        if (isMatched) {
                          if (topSim >= 0.8) bgClass = "bg-rose-500";
                          else if (topSim >= 0.5) bgClass = "bg-amber-400";
                          else bgClass = "bg-yellow-300";
                          title = `Section ${secNum} — ${(topSim * 100).toFixed(0)}% overlap`;
                        }
                        return (
                          <div
                            key={`map-${secNum}`}
                            className={`${bgClass} h-3.5 w-full cursor-help rounded-sm transition hover:brightness-110 hover:ring-1 hover:ring-slate-500`}
                            title={title}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-4 rounded-sm bg-emerald-300 ring-1 ring-emerald-400/50" />
                      <span>Accepted (original)</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-4 rounded-sm bg-yellow-300 ring-1 ring-yellow-400/50" />
                      <span>Low overlap</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-4 rounded-sm bg-amber-400 ring-1 ring-amber-500/50" />
                      <span>Medium overlap</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-4 rounded-sm bg-rose-500 ring-1 ring-rose-600/50" />
                      <span>High overlap</span>
                    </span>
                  </div>
                </div>
              ) : null}

              <p className="mt-3 text-xs text-slate-600">
                {authorship.totalSections > 0 ? (
                  <>
                    {authorship.originalSections} of {authorship.totalSections} section{authorship.totalSections === 1 ? "" : "s"} accepted as original.
                    {authorship.matchedSections > 0
                      ? ` ${authorship.matchedSections} section${authorship.matchedSections === 1 ? "" : "s"} flagged with existing documents.`
                      : " No sections flagged."}
                  </>
                ) : (
                  "Document text was too short to perform section-level analysis."
                )}
              </p>

              {authorship.contributors && authorship.contributors.length > 0 ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-slate-700">Contributing documents</p>
                  <ul className="mt-1.5 space-y-1.5 text-xs text-slate-600">
                    {authorship.contributors.slice(0, 5).map((c) => (
                      <li key={c.documentId} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span className="font-medium text-slate-800">{c.documentName}</span>
                        {c.authors ? <span className="text-slate-500">by {c.authors}</span> : null}
                        <span className="text-slate-400">·</span>
                        <span>{c.similarSections} section{c.similarSections === 1 ? "" : "s"}</span>
                        <span className="text-slate-400">·</span>
                        <span>avg {c.averageSimilarity}</span>
                        <span className="text-slate-400">·</span>
                        <span>{c.contributionPercentage}% of document</span>
                      </li>
                    ))}
                    {authorship.contributors.length > 5 ? (
                      <li className="text-slate-500">+ {authorship.contributors.length - 5} more contributor(s)</li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
            </article>
          ) : null}

          {/* <div className="mt-4 grid gap-3 md:grid-cols-2">
            <article className={`rounded-xl border p-3 ${isVerified ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-slate-50/70"}`}>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Decision</h3>
              <p className={`mt-1.5 text-base font-semibold ${isVerified ? "text-emerald-700" : "text-rose-700"}`}>
                {isVerified ? "Accepted" : "Rejected"}
              </p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Blockchain</h3>
              <p className="mt-1.5 truncate font-mono text-xs text-slate-900" title={transactionHash}>
                {transactionHash === "not available" ? "Not anchored" : `${transactionHash.slice(0, 14)}…${transactionHash.slice(-8)}`}
              </p>
            </article>
          </div> */}

          {successSimilarity && successSimilarity.perSectionMatches && Object.keys(successSimilarity.perSectionMatches).length > 0 ? (
            <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                Show matched sections ({Object.keys(successSimilarity.perSectionMatches).length})
              </summary>
              <p className="mt-1 text-xs text-slate-600">
                These sections overlapped with previously stored documents but the overall similarity stayed within the acceptance threshold.
              </p>
              <div className="mt-3 space-y-4">
                {Object.keys(successSimilarity.perSectionMatches).map((secKey) => {
                  const secIndex = Number(secKey);
                  const matches = successSimilarity.perSectionMatches[secKey] || [];
                  const topSim = matches.reduce((max, m) => Math.max(max, m.similarity || 0), 0);
                  const topColor = severityColors(topSim);
                  return (
                    <div key={`success-sec-${secKey}`} className="rounded-xl border border-slate-200 p-3">
                      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">Section {secIndex}</span>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5">
                          {matches.length} match{matches.length > 1 ? "es" : ""}
                        </span>
                        {topSim > 0 ? (
                          <span className={`rounded-full px-2 py-0.5 font-medium ring-1 ${topColor.badge}`}>
                            {topColor.label} overlap
                          </span>
                        ) : null}
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                            Uploaded Document
                          </p>
                          <p className="max-h-36 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                            {matches[0]?.yourText || "(No uploaded text provided)"}
                          </p>
                        </div>
                        <div className="space-y-2">
                          {matches.map((m, i) => {
                            const severity = severityColors(m.similarity || 0);
                            return (
                              <div key={`${secKey}-m-${i}`} className={`rounded-lg border ${severity.border} ${severity.bg} p-3`}>
                                <div className="mb-1.5">
                                  <p className="line-clamp-1 text-xs font-semibold text-slate-800" title={m.matchedTitle || m.matchedDocument}>
                                    {m.matchedTitle || m.matchedDocument || "Unknown"}
                                  </p>
                                  {m.matchedAuthors ? (
                                    <p className="truncate text-[10px] text-slate-500">
                                      <span className="text-slate-400">Author:</span> {m.matchedAuthors}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[10px]">
                                  <span className={`font-semibold ${severity.badge.split(" ").slice(0, 2).join(" ")}`}>
                                    {((m.similarity || 0) * 100).toFixed(1)}%
                                  </span>
                                  <span className="text-slate-500">match</span>
                                  <span className={`rounded-full px-1.5 py-0.5 font-medium ring-1 ${severity.badge}`}>
                                    {severity.label}
                                  </span>
                                </div>
                                <p className="max-h-32 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                                  {m.matchedText ? highlightOverlap(m.matchedText, matches[0]?.yourText || "", 3) : "(No DB text)"}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
