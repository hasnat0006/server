"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_API_BASE = "http://localhost:5000";
const ANALYSIS_STEPS = [
  "Extracting content",
  "Generating embeddings",
  "Retrieving candidate chunks",
  "Running semantic analysis",
  "Calculating authorship score",
  "Finalizing report",
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

function normalizeForCompare(value) {
  if (value == null) return "";
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildLineHighlights(text, expected, found) {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const expNorm = normalizeForCompare(expected);
  const fndNorm = normalizeForCompare(found);
  if (!expNorm && !fndNorm) return lines.map(() => null);
  return lines.map((line) => {
    const lineNorm = normalizeForCompare(line);
    if (expNorm && lineNorm.includes(expNorm)) {
      return { kind: "expected", reason: "expected text" };
    }
    if (fndNorm && lineNorm.includes(fndNorm)) {
      return { kind: "found", reason: "different value found" };
    }
    return null;
  });
}

function XaiReasoningPanel({ analysis }) {
  if (!analysis) return null;
  const severity =
    analysis.confidence >= 90 ? "high" : analysis.confidence >= 60 ? "medium" : "low";
  const severityClass =
    severity === "high"
      ? "bg-rose-100 text-rose-800 ring-rose-300"
      : severity === "medium"
      ? "bg-amber-100 text-amber-800 ring-amber-300"
      : "bg-slate-100 text-slate-700 ring-slate-300";

  return (
    <article className="mt-4 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-amber-50/30 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-700">
            AI Reasoning
          </h3>
          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-mono text-slate-700">
            XAI
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${severityClass}`}>
            {analysis.confidence}% confidence
          </span>
          {analysis.modelVersion ? (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-500 ring-1 ring-slate-300">
              {analysis.modelVersion}
            </span>
          ) : null}
        </div>
      </div>
      {analysis.summary ? (
        <p className="mt-2 text-sm font-medium text-slate-800">{analysis.summary}</p>
      ) : null}

      {analysis.reasons?.length ? (
        <div className="mt-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            Why this verdict
          </h4>
          <ul className="mt-1.5 space-y-1.5">
            {analysis.reasons.map((r, i) => {
              const tone =
                r.type === "critical"
                  ? "border-rose-300 bg-rose-50 text-rose-800"
                  : r.type === "warning"
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : r.type === "positive"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-slate-50 text-slate-700";
              return (
                <li
                  key={i}
                  className={`rounded-md border px-3 py-2 text-xs ${tone}`}
                >
                  <span className="mr-1 font-semibold uppercase tracking-wide">[{r.type}]</span>
                  {r.message}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {analysis.evidence?.length ? (
        <div className="mt-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            Evidence
          </h4>
          <ul className="mt-1.5 space-y-2">
            {analysis.evidence.map((e, i) => (
              <li
                key={i}
                className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-700"
              >
                <p className="font-semibold uppercase tracking-wide text-slate-500">
                  {e.type.replace(/_/g, " ")}
                </p>
                {e.message ? <p className="mt-1 text-slate-700">{e.message}</p> : null}
                {Array.isArray(e.items) ? (
                  <ul className="mt-2 space-y-2">
                    {e.items.map((it, j) => (
                      <li
                        key={j}
                        className="rounded border border-rose-200 bg-rose-50/40 p-2.5"
                      >
                        <p className="font-semibold text-rose-800">
                          {it.field?.replace(/_/g, " ") || "field"}
                        </p>
                        <p className="mt-1 text-slate-700">
                          <span className="font-mono text-[10px] uppercase text-slate-500">expected</span>{" "}
                          <span className="font-mono text-emerald-800">
                            {JSON.stringify(it.expected)}
                          </span>
                        </p>
                        <p className="mt-0.5 text-slate-700">
                          <span className="font-mono text-[10px] uppercase text-slate-500">found</span>{" "}
                          <span className="font-mono text-rose-800">
                            {JSON.stringify(it.found)}
                          </span>
                        </p>
                        {it.location ? (
                          <p className="mt-1 text-slate-600">
                            <span className="font-mono text-[10px] uppercase text-slate-500">where</span>{" "}
                            line {it.location.lineNumber} of stored record:{" "}
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-800">
                              {it.location.snippet}
                            </span>
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {e.exactCount != null ? (
                  <p className="mt-1 text-slate-600">
                    Exact matches: {e.exactCount}, fuzzy matches: {e.fuzzyCount}
                  </p>
                ) : null}
                {e.revokedAt ? (
                  <p className="mt-1 text-slate-600">
                    Revoked at: <span className="font-mono">{e.revokedAt}</span>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {analysis.recommendations?.length ? (
        <div className="mt-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            Recommended Actions
          </h4>
          <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs text-slate-700">
            {analysis.recommendations.map((rc, i) => (
              <li key={i}>{rc}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {analysis.generatedAt ? (
        <p className="mt-3 text-[10px] font-mono text-slate-400">
          Generated at {new Date(analysis.generatedAt).toLocaleString()}
        </p>
      ) : null}
    </article>
  );
}

function VerdictBanner({ result }) {
  if (!result) return null;
  const { verdict, matchedBy, xaiAnalysis } = result;
  const isTampered = verdict === "tampered";
  const isRevoked = verdict === "revoked";
  const isNotACertificate = verdict === "not_a_certificate";
  const isUnknown = verdict === "unknown" || verdict === "suspicious" || isNotACertificate;

  const evidenceItems =
    xaiAnalysis?.evidence?.flatMap((e) =>
      Array.isArray(e.items) ? e.items : []
    ) || [];

  const mismatchCount = evidenceItems.length;

  const severityColor = isTampered
    ? "rose"
    : isRevoked
    ? "amber"
    : isUnknown
    ? "slate"
    : "emerald";

  const borderColor = {
    rose: "border-rose-300",
    amber: "border-amber-300",
    slate: "border-slate-300",
    emerald: "border-emerald-300",
  }[severityColor];

  const bgGradient = {
    rose: "bg-gradient-to-br from-rose-50 via-white to-rose-50",
    amber: "bg-gradient-to-br from-amber-50 via-white to-amber-50",
    slate: "bg-slate-50",
    emerald: "bg-gradient-to-br from-emerald-50 via-white to-emerald-50",
  }[severityColor];

  const verdictLabel = isTampered
    ? "REJECTED"
    : isRevoked
    ? "REVOKED"
    : isNotACertificate
    ? "NOT A CERTIFICATE"
    : isUnknown
    ? "UNKNOWN"
    : "VERIFIED";

  return (
    <div className={`relative overflow-hidden rounded-2xl border-2 p-5 sm:p-6 ${borderColor} ${bgGradient}`}>
      <div
        className={`absolute left-0 top-0 bottom-0 w-1.5 ${
          isTampered
            ? "bg-gradient-to-b from-rose-500 to-rose-700"
            : isRevoked
            ? "bg-gradient-to-b from-amber-500 to-amber-600"
            : isUnknown
            ? "bg-slate-400"
            : "bg-gradient-to-b from-emerald-500 to-emerald-600"
        }`}
      />
      <div className="flex items-start gap-4 sm:gap-6">
        <div
          className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full sm:h-20 sm:w-20 ${
            isTampered
              ? "bg-gradient-to-br from-rose-500 to-rose-700 shadow-lg shadow-rose-500/30"
              : isRevoked
              ? "bg-gradient-to-br from-amber-500 to-amber-600 shadow-lg shadow-amber-500/30"
              : isUnknown
              ? "bg-slate-400 shadow-lg shadow-slate-400/20"
              : "bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30"
          }`}
        >
          {isTampered || isRevoked ? (
            <svg className="h-10 w-10 text-white sm:h-12 sm:w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : isUnknown ? (
            <svg className="h-10 w-10 text-white sm:h-12 sm:w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01" />
              <circle cx="12" cy="12" r="10" strokeWidth={2} />
            </svg>
          ) : (
            <svg className="h-10 w-10 text-white sm:h-12 sm:w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <div className="min-w-0 flex-1 pt-1">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-[0.15em] ${
              isTampered
                ? "bg-white/70 text-rose-700"
                : isRevoked
                ? "bg-white/70 text-amber-700"
                : isUnknown
                ? "bg-white/70 text-slate-600"
                : "bg-white/70 text-emerald-700"
            }`}
          >
            Verdict: {verdictLabel}
          </span>
          <h2
            className={`mt-1 text-xl font-extrabold sm:text-2xl ${
              isTampered
                ? "text-rose-900"
                : isRevoked
                ? "text-amber-900"
                : isUnknown
                ? "text-slate-800"
                : "text-emerald-900"
            }`}
          >
            {isTampered
              ? `${mismatchCount} Field${mismatchCount !== 1 ? "s" : ""} Don't Match`
              : isRevoked
              ? "Certificate Has Been Revoked"
              : isNotACertificate
              ? "Document Is Not a Certificate"
              : isUnknown
              ? "Unable to Determine Authenticity"
              : "All Fields Match"}
          </h2>
          {matchedBy || isNotACertificate ? (
            <p className={`mt-1 text-sm ${isTampered ? "text-rose-700" : isRevoked ? "text-amber-700" : "text-slate-600"}`}>
              {matchedBy ? <>Matched by {matchedBy.replace(/_/g, " ")}</> : null}
              {isTampered ? ", but document content has been altered" : ""}
              {isNotACertificate && !matchedBy ? "The uploaded file does not contain certificate-like content." : null}
            </p>
          ) : null}
        </div>
      </div>

      {evidenceItems.length > 0 ? (
        <>
          <div className={`mt-4 flex flex-wrap gap-2 ${isTampered ? "" : ""}`}>
            {evidenceItems.map((item, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                  isTampered
                    ? "border-rose-300 bg-white text-rose-800 shadow-sm"
                    : "border-slate-300 bg-white text-slate-700"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isTampered ? "bg-rose-500" : "bg-slate-400"
                  }`}
                />
                {item.field?.replace(/_/g, " ")}
              </span>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {evidenceItems.map((item, i) => (
              <div
                key={i}
                className={`rounded-xl border bg-white p-3 ${
                  isTampered ? "border-rose-200" : "border-slate-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  {item.location?.lineNumber ? (
                    <span className="rounded-md bg-rose-100 px-2 py-0.5 font-mono text-[11px] font-bold text-rose-800">
                      Line {item.location.lineNumber}
                    </span>
                  ) : null}
                  <span className="text-sm font-semibold text-slate-800">
                    {item.field?.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="mt-2 grid gap-1 text-xs">
                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <span className="font-semibold text-slate-500">Expected</span>
                    <span className="rounded bg-emerald-50 px-2 py-0.5 font-mono text-emerald-800">
                      {String(item.expected ?? "")}
                    </span>
                    <span className="font-semibold text-slate-500">Found</span>
                    <span className="rounded bg-rose-50 px-2 py-0.5 font-mono text-rose-800">
                      {String(item.found ?? "")}
                    </span>
                  </div>
                </div>
                {item.location?.snippet ? (
                  <div className="mt-2 rounded border-l-2 border-rose-300 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-700">
                    {item.location.snippet}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState("document");
  const [certMode, setCertMode] = useState("verify");
  const [file, setFile] = useState(null);
  const [uploaderName, setUploaderName] = useState("");
  const [title, setTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const certVerifyFileRef = useRef(null);
  const certIssueFileRef = useRef(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [failureDetails, setFailureDetails] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [totalTimeSeconds, setTotalTimeSeconds] = useState(null);
  const analysisStartRef = useRef(null);
  const timerRef = useRef(null);

  // Certificate verification state
  const [certVerifyFile, setCertVerifyFile] = useState(null);
  const [certVerifyPreviewUrl, setCertVerifyPreviewUrl] = useState(null);
  const [certVerifyHint, setCertVerifyHint] = useState("");
  const [certVerifyResult, setCertVerifyResult] = useState(null);
  const [certVerifyError, setCertVerifyError] = useState("");
  const [certVerifySubmitting, setCertVerifySubmitting] = useState(false);

  // Certificate issuance state
  const [certIssueOrgApiKey, setCertIssueOrgApiKey] = useState("");
  const [certIssueFile, setCertIssueFile] = useState(null);
  const todayIso = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  })();
  const [certIssueFields, setCertIssueFields] = useState({
    recipient_name: "",
    course_or_title: "",
    issue_date: todayIso,
    certificate_serial: ""
  });
  const [certIssueResult, setCertIssueResult] = useState(null);
  const [certIssueError, setCertIssueError] = useState("");
  const [certIssueSubmitting, setCertIssueSubmitting] = useState(false);

  // My certificates state
  const [myCertsApiKey, setMyCertsApiKey] = useState("");
  const [myCertsOrgInfo, setMyCertsOrgInfo] = useState(null);
  const [myCertsList, setMyCertsList] = useState([]);
  const [myCertsError, setMyCertsError] = useState("");
  const [myCertsLoading, setMyCertsLoading] = useState(false);

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

  // Live elapsed timer — ticks every second while analysis is running
  useEffect(() => {
    if (isSubmitting) {
      analysisStartRef.current = Date.now();
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - analysisStartRef.current) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isSubmitting]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedIssue = window.localStorage.getItem("cert_issue_api_key");
    if (savedIssue) setCertIssueOrgApiKey(savedIssue);
    const savedMine = window.localStorage.getItem("cert_mine_api_key");
    if (savedMine) setMyCertsApiKey(savedMine);
  }, []);

  function resetDocumentState() {
    setResult(null);
    setError("");
    setFailureDetails(null);
    setActiveStep(0);
    setProgressPercent(0);
    setElapsedSeconds(0);
    setTotalTimeSeconds(null);
  }

  function resetCertVerifyState() {
    setCertVerifyResult(null);
    setCertVerifyError("");
  }

  function resetCertIssueState() {
    setCertIssueResult(null);
    setCertIssueError("");
  }

  function switchTab(nextTab) {
    setActiveTab(nextTab);
    if (nextTab !== "document") resetDocumentState();
    if (nextTab !== "certificate") resetCertVerifyState();
  }

  function switchCertMode(nextMode) {
    setCertMode(nextMode);
    if (nextMode !== "verify") resetCertVerifyState();
    if (nextMode !== "issue") resetCertIssueState();
  }

  async function handleCertVerify(event) {
    event.preventDefault();
    setCertVerifyError("");
    setCertVerifyResult(null);
    if (!certVerifyFile) {
      setCertVerifyError("Please choose a certificate file to verify.");
      return;
    }
    if (certVerifyPreviewUrl) {
      URL.revokeObjectURL(certVerifyPreviewUrl);
    }
    setCertVerifyPreviewUrl(URL.createObjectURL(certVerifyFile));
    setCertVerifySubmitting(true);
    try {
      const formData = new FormData();
      formData.append("document", certVerifyFile);
      if (certVerifyHint && certVerifyHint.trim()) {
        formData.append("certificateId", certVerifyHint.trim());
      }
      const response = await fetch(`${apiBase}/api/certificates/verify`, {
        method: "POST",
        body: formData
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setCertVerifyError(payload?.error || `Verification failed (HTTP ${response.status})`);
        return;
      }
      if (!payload?.success) {
        setCertVerifyError(payload?.error || "Verification failed.");
        return;
      }
      setCertVerifyResult(payload.data);
    } catch (err) {
      setCertVerifyError(err?.message || "Network error during verification.");
    } finally {
      setCertVerifySubmitting(false);
    }
  }

  async function handleCertIssue(event) {
    event.preventDefault();
    setCertIssueError("");
    setCertIssueResult(null);
    if (!certIssueOrgApiKey.trim()) {
      setCertIssueError("Please provide your organization API key.");
      return;
    }
    if (!certIssueFile) {
      setCertIssueError("Please choose a certificate file.");
      return;
    }
    if (!certIssueFields.recipient_name?.toString().trim()) {
      setCertIssueError("Recipient name is required.");
      return;
    }

    setCertIssueSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("document", certIssueFile);
      formData.append("fields", JSON.stringify(certIssueFields));
      const response = await fetch(`${apiBase}/api/certificates/issue`, {
        method: "POST",
        headers: { "X-Org-API-Key": certIssueOrgApiKey.trim() },
        body: formData
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const details = payload?.details?.length ? ` (${payload.details.join("; ")})` : "";
        setCertIssueError((payload?.error || `Issuance failed (HTTP ${response.status})`) + details);
        return;
      }
      if (!payload?.success) {
        setCertIssueError(payload?.error || "Issuance failed.");
        return;
      }
      setCertIssueResult(payload.data);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("cert_issue_api_key", certIssueOrgApiKey.trim());
      }
    } catch (err) {
      setCertIssueError(err?.message || "Network error during issuance.");
    } finally {
      setCertIssueSubmitting(false);
    }
  }

  async function loadMyCerts() {
    if (!myCertsApiKey.trim()) {
      setMyCertsError("Please provide your organization API key.");
      return;
    }
    setMyCertsError("");
    setMyCertsLoading(true);
    setMyCertsOrgInfo(null);
    setMyCertsList([]);
    try {
      const meRes = await fetch(`${apiBase}/api/organizations/me`, {
        headers: { "X-Org-API-Key": myCertsApiKey.trim() }
      });
      const mePayload = await meRes.json().catch(() => null);
      if (!meRes.ok || !mePayload?.success) {
        setMyCertsError(mePayload?.error || "Invalid API key.");
        return;
      }
      setMyCertsOrgInfo(mePayload.data);

      const listRes = await fetch(`${apiBase}/api/certificates?limit=200`, {
        headers: { "X-Org-API-Key": myCertsApiKey.trim() }
      });
      const listPayload = await listRes.json().catch(() => null);
      if (!listRes.ok || !listPayload?.success) {
        setMyCertsError(listPayload?.error || "Failed to load certificates.");
        return;
      }
      setMyCertsList(listPayload.data?.certificates || []);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("cert_mine_api_key", myCertsApiKey.trim());
      }
    } catch (err) {
      setMyCertsError(err?.message || "Network error while loading certificates.");
    } finally {
      setMyCertsLoading(false);
    }
  }

  async function revokeMyCert(certId) {
    if (!myCertsApiKey.trim()) return;
    const reason = window.prompt(`Revoke ${certId}? Provide a reason (optional):`) || "";
    try {
      const res = await fetch(`${apiBase}/api/certificates/${encodeURIComponent(certId)}/revoke`, {
        method: "POST",
        headers: {
          "X-Org-API-Key": myCertsApiKey.trim(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ reason })
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        alert(`Revoke failed: ${payload?.error || res.status}`);
        return;
      }
      await loadMyCerts();
    } catch (err) {
      alert(`Revoke error: ${err.message}`);
    }
  }

  async function handleUpload(event) {
    event.preventDefault();
    setError("");
    setResult(null);
    setFailureDetails(null);
    setActiveStep(0);
    setProgressPercent(0);
    setTotalTimeSeconds(null);

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
    formData.append("uploaderName", uploaderName || "Anonymous");
    formData.append("title", title || "");

    setIsSubmitting(true);
    const uploadStart = Date.now();

    try {
      const response = await fetch(`${apiBase}/api/document/analyze-stream`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok || !response.body) {
        // Fallback: try to parse error as JSON
        let payload = null;
        try { payload = await response.json(); } catch { payload = null; }
        const reason = payload?.message || payload?.error || `Upload failed (HTTP ${response.status})`;
        throw new Error(reason);
      }

      // Consume SSE stream line-by-line
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Split on double-newline (SSE event boundary)
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const jsonStr = line.slice(5).trim();
          let evt;
          try { evt = JSON.parse(jsonStr); } catch { continue; }

          if (evt.error) {
            throw new Error(evt.message || "Analysis failed");
          }

          if (evt.done) {
            const totalSec = Math.round((Date.now() - uploadStart) / 1000);
            setTotalTimeSeconds(totalSec);
            setProgressPercent(100);
            setActiveStep(ANALYSIS_STEPS.length - 1);

            if (evt.rejected) {
              // Build a failureDetails-compatible object from the SSE done event
              const syntheticPayload = {
                success: false,
                message: evt.message || "Upload rejected.",
                error: evt.reason || "rejected",
                authorship: evt.data?.authorship || null,
                similarity: evt.data?.similarity || null,
              };
              setFailureDetails(syntheticPayload);
              setError(evt.message || "Upload rejected.");
            } else if (evt.success) {
              setResult(evt);
            }
            break;
          }

          // Progress event
          if (evt.stageIndex !== undefined) {
            setActiveStep(evt.stageIndex);
            setProgressPercent(Math.min(evt.percent ?? 0, 97));
          }
        }
      }
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

  function formatElapsed(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-4 px-4 pb-16 pt-10 sm:px-6">
      <section className="rounded-2xl border border-emerald-100/80 bg-white/80 p-4 shadow-sm backdrop-blur-sm text-center">
        <p className="text-[30px] font-bold uppercase tracking-[0.05em] text-emerald-700">Document Verification</p>
        <p className="mx-auto mt-1 max-w-xl text-sm text-slate-500 sm:text-base">
          Upload once, then review AI and blockchain verification in one clean view.
        </p>
      </section>

      <nav className="flex flex-wrap items-stretch gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <button
          type="button"
          onClick={() => switchTab("document")}
          className={`flex-1 rounded-xl px-3 py-3 text-sm font-semibold transition ${
            activeTab === "document"
              ? "bg-emerald-600 text-white shadow-sm"
              : "bg-slate-50 text-slate-600 hover:bg-slate-100"
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Document Verification
          </span>
        </button>
        <button
          type="button"
          onClick={() => switchTab("certificate")}
          className={`flex-1 rounded-xl px-3 py-3 text-sm font-semibold transition ${
            activeTab === "certificate"
              ? "bg-emerald-600 text-white shadow-sm"
              : "bg-slate-50 text-slate-600 hover:bg-slate-100"
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
            Certificate
          </span>
        </button>
      </nav>

      {activeTab === "document" ? (
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

          <div className="grid gap-4 md:grid-cols-2">
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
      ) : null}

      {activeTab === "certificate" ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold text-slate-900">Certificate</h2>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
              Blockchain-anchored verification
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Verify an existing certificate, issue a new one, or manage certificates you have issued.
          </p>

          <div className="mt-4 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 shadow-sm">
            {[
              { id: "verify", label: "Verify", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
              { id: "issue", label: "Issue", icon: "M12 4v16m8-8H4" },
              { id: "my", label: "My Certificates", icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" }
            ].map((m) => {
              const isActive = certMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => switchCertMode(m.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    isActive
                      ? "bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-200"
                      : "text-slate-600 hover:text-slate-800"
                  }`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={m.icon} />
                  </svg>
                  {m.label}
                </button>
              );
            })}
          </div>

          {certMode === "verify" ? (
          <>
          <h3 className="mt-5 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Verify</h3>
          <p className="mt-1 text-sm text-slate-600">
            Upload a certificate to check whether it was issued and anchored on the blockchain. A field-level diff shows exactly which values differ from the on-chain record.
          </p>

          <form className="mt-4 grid gap-4" onSubmit={handleCertVerify}>
            <div
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white p-8 text-center transition hover:border-emerald-400 hover:bg-emerald-50/50"
              onClick={() => certVerifyFileRef.current?.click()}
            >
              <input
                ref={certVerifyFileRef}
                type="file"
                className="hidden"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  setCertVerifyFile(file);
                  if (certVerifyPreviewUrl) URL.revokeObjectURL(certVerifyPreviewUrl);
                  setCertVerifyPreviewUrl(file ? URL.createObjectURL(file) : null);
                  setCertVerifyResult(null);
                }}
              />
              {certVerifyFile ? (
                <div>
                  <p className="text-sm font-medium text-slate-900">{certVerifyFile.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{(certVerifyFile.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium text-slate-700">Drop a certificate here, or click to browse</p>
                  <p className="mt-1 text-xs text-slate-500">PDF / PNG / JPG / WEBP (max 10 MB)</p>
                </div>
              )}
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">Certificate ID (optional)</span>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                placeholder="e.g. CERT-LX9A2B-3F4D5E"
                value={certVerifyHint}
                onChange={(event) => setCertVerifyHint(event.target.value)}
              />
            </label>

            <button
              type="submit"
              disabled={certVerifySubmitting}
              className="rounded-xl bg-gradient-to-r from-emerald-700 to-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:translate-y-[-1px] hover:shadow-md disabled:cursor-wait disabled:opacity-70"
            >
              {certVerifySubmitting ? "Verifying..." : "Verify Certificate"}
            </button>
          </form>

          {certVerifyError ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {certVerifyError}
            </div>
          ) : null}
          </>
          ) : null}

          {certMode === "issue" ? (
          <>
          <h3 className="mt-5 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Issue</h3>
          <p className="mt-1 text-sm text-slate-600">
            For issuing organizations. Provide your API key, the canonical fields, and the certificate file. The data is anchored on the blockchain and stored for future verification.
          </p>

          <form className="mt-4 grid gap-4" onSubmit={handleCertIssue}>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">Organization API Key</span>
              <input
                type="password"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-mono text-slate-900 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                placeholder="ck_live_..."
                value={certIssueOrgApiKey}
                onChange={(event) => setCertIssueOrgApiKey(event.target.value)}
              />
              <span className="text-xs text-slate-500">
                Saved in this browser. Never sent anywhere except your server.
              </span>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Recipient Name *</span>
                <input
                  type="text"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                  placeholder="e.g. Alice Smith"
                  value={certIssueFields.recipient_name}
                  onChange={(event) => setCertIssueFields((prev) => ({ ...prev, recipient_name: event.target.value }))}
                  required
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Course / Title (optional)</span>
                <input
                  type="text"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                  placeholder="e.g. Bachelor of Science in Computer Science"
                  value={certIssueFields.course_or_title}
                  onChange={(event) => setCertIssueFields((prev) => ({ ...prev, course_or_title: event.target.value }))}
                />
              </label>
              <label className="grid gap-2">
                <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  Issue Date
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">defaults to today</span>
                </span>
                <input
                  type="date"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                  value={certIssueFields.issue_date}
                  onChange={(event) => setCertIssueFields((prev) => ({ ...prev, issue_date: event.target.value }))}
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Certificate Serial (optional)</span>
                <input
                  type="text"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-mono text-slate-900 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                  placeholder="e.g. EX-2025-0001"
                  value={certIssueFields.certificate_serial}
                  onChange={(event) => setCertIssueFields((prev) => ({ ...prev, certificate_serial: event.target.value }))}
                />
              </label>
            </div>

            <div
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 text-center transition hover:border-emerald-400 hover:bg-emerald-50/50"
              onClick={() => certIssueFileRef.current?.click()}
            >
              <input
                ref={certIssueFileRef}
                type="file"
                className="hidden"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                onChange={(event) => setCertIssueFile(event.target.files?.[0] || null)}
              />
              {certIssueFile ? (
                <div>
                  <p className="text-sm font-medium text-slate-900">{certIssueFile.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{(certIssueFile.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium text-slate-700">Drop a certificate file here, or click to browse</p>
                  <p className="mt-1 text-xs text-slate-500">PDF / PNG / JPG / WEBP (max 10 MB)</p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={certIssueSubmitting}
              className="rounded-xl bg-gradient-to-r from-emerald-700 to-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:translate-y-[-1px] hover:shadow-md disabled:cursor-wait disabled:opacity-70"
            >
              {certIssueSubmitting ? "Issuing & Anchoring..." : "Issue Certificate"}
            </button>
          </form>

          {certIssueError ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {certIssueError}
            </div>
          ) : null}
          </>
          ) : null}

      {certMode === "my" ? (
          <>
          <h3 className="mt-5 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">My Certificates</h3>
          <p className="mt-1 text-sm text-slate-600">
            List and revoke certificates issued by your organization.
          </p>

          <form
            className="mt-4 flex flex-wrap items-end gap-3"
            onSubmit={(event) => { event.preventDefault(); loadMyCerts(); }}
          >
            <label className="grid flex-1 gap-2">
              <span className="text-sm font-medium text-slate-700">Organization API Key</span>
              <input
                type="password"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-mono text-slate-900 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                placeholder="ck_live_..."
                value={myCertsApiKey}
                onChange={(event) => setMyCertsApiKey(event.target.value)}
              />
            </label>
            <button
              type="submit"
              disabled={myCertsLoading}
              className="rounded-xl bg-gradient-to-r from-emerald-700 to-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:translate-y-[-1px] hover:shadow-md disabled:cursor-wait disabled:opacity-70"
            >
              {myCertsLoading ? "Loading..." : "Load Certificates"}
            </button>
          </form>

          {myCertsError ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {myCertsError}
            </div>
          ) : null}

          {myCertsOrgInfo ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-slate-700">
              <p><span className="font-semibold text-slate-900">{myCertsOrgInfo.name}</span> ({myCertsOrgInfo.orgId})</p>
              <p className="text-xs text-slate-500">Active: {String(myCertsOrgInfo.isActive)} · Created: {new Date(myCertsOrgInfo.createdAt).toLocaleString()}</p>
            </div>
          ) : null}

          {myCertsList.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {myCertsList.map((c) => (
                <li key={c.certificateId} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono font-semibold text-slate-900">{c.certificateId}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                      c.status === "active"
                        ? "bg-emerald-100 text-emerald-700 ring-emerald-300"
                        : "bg-rose-100 text-rose-700 ring-rose-300"
                    }`}>
                      {c.status}
                    </span>
                    <span className="text-xs text-slate-500">Serial: {c.certificateSerial || "—"}</span>
                    {c.hasDocument && c.documentUrl ? (
                      <a
                        href={c.documentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        View Document
                      </a>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-800">{c.recipientName} — {c.courseOrTitle || "—"}</p>
                  <p className="text-xs text-slate-500">
                    Issued: {c.issueDate} · Issued at: {new Date(c.issuedAt).toLocaleString()}
                  </p>
                  {c.status === "active" ? (
                    <button
                      type="button"
                      onClick={() => revokeMyCert(c.certificateId)}
                      className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                    >
                      Revoke
                    </button>
                  ) : c.revokedAt ? (
                    <p className="mt-1 text-xs text-rose-600">
                      Revoked at {new Date(c.revokedAt).toLocaleString()}{c.revocationReason ? ` — ${c.revocationReason}` : ""}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          </>
          ) : null}
        </section>
      ) : null}

      {isSubmitting ? (
        <section className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-900">Analysis in progress</h2>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-200">
                {progressPercent}% complete
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-mono font-semibold text-slate-600">
                ⏱ {formatElapsed(elapsedSeconds)}
              </span>
            </div>
          </div>

          <p className="mt-2 text-sm text-slate-600">
            <span className="font-medium text-sky-700">{ANALYSIS_STEPS[activeStep]}</span>
            {" "}— Please wait while we verify your document against existing records.
          </p>

          <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 via-teal-500 to-emerald-500 transition-all duration-700"
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
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-all ${
                    isCompleted
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : isCurrent
                        ? "border-sky-200 bg-sky-50 text-sky-800 shadow-sm"
                        : "border-slate-200 bg-slate-50 text-slate-400"
                  }`}
                >
                  <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    isCompleted
                      ? "bg-emerald-600 text-white"
                      : isCurrent
                        ? "bg-sky-600 text-white"
                        : "bg-slate-300 text-slate-600"
                  }`}>
                    {isCompleted ? "✓" : index + 1}
                  </span>
                  <span className={isCurrent ? "font-semibold" : ""}>{step}</span>
                  {isCurrent ? (
                    <span className="ml-auto flex items-center gap-1.5 text-xs text-sky-600">
                      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
                      Running…
                    </span>
                  ) : isCompleted ? (
                    <span className="ml-auto text-[10px] font-medium text-emerald-600">Done</span>
                  ) : null}
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
                    <div key={`rej-sec-${secKey}`} className={`rounded-xl border ${topColor.border} ${topColor.bg} p-3`}>
                      {/* Section header */}
                      <div className="mb-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-lg text-slate-800">Section {secIndex}</span>
                          <span className="rounded-md bg-white/70 border border-slate-200 px-2 py-0.5 text-xs text-slate-600">
                            {matches.length} match{matches.length > 1 ? "es" : ""}
                          </span>
                        </div>
                        <div className="mt-1">
                          <span className={`inline-flex rounded-full px-3 py-0.5 text-sm font-bold ring-1 ${topColor.badge}`}>
                            Section Content Match: {(topSim * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      {/* Similarity progress bar */}
                      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-white/60">
                        <div
                          className={`h-full rounded-full transition-all ${
                            topSim >= 0.8 ? "bg-red-500" : topSim >= 0.5 ? "bg-amber-400" : "bg-yellow-400"
                          }`}
                          style={{ width: `${(topSim * 100).toFixed(1)}%` }}
                        />
                      </div>
                      {/* Side-by-side content */}
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                            YOUR DOCUMENT
                          </p>
                          <p className="max-h-36 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                            {matches[0]?.yourText || "(No uploaded text provided)"}
                          </p>
                        </div>
                        <div className="space-y-2">
                          {matches.map((m, i) => {
                            const severity = severityColors(m.similarity || 0);
                            return (
                              <div key={`rej-${secKey}-m-${i}`} className={`rounded-lg border ${severity.border} bg-white/80 p-3`}>
                                {/* Source attribution */}
                                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">MATCHED SOURCE</p>
                                <div className="mb-3 rounded-md bg-slate-100/80 px-2 py-1.5">
                                  <p className="line-clamp-1 text-xs font-semibold text-slate-800" title={m.matchedTitle || m.matchedDocument}>
                                    {m.matchedTitle || m.matchedDocument || "Unknown"}
                                  </p>
                                  {m.matchedAuthors ? (
                                    <p className="truncate text-[10px] text-slate-500">by {m.matchedAuthors}</p>
                                  ) : null}
                                </div>
                                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">MATCHED DATABASE CONTENT</p>
                                <p className="mb-4 max-h-32 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                                  {m.matchedText ? highlightOverlap(m.matchedText, matches[0]?.yourText || "", 3) : "(No DB text)"}
                                </p>
                                {/* Coverage Analysis */}
                                <div className="rounded-md border border-slate-100 bg-slate-50/80 p-2.5">
                                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Coverage Analysis</p>
                                  <div className="grid gap-1.5 text-xs text-slate-600">
                                    <div className="flex justify-between">
                                      <span>Section Content covered:</span>
                                      <span className="font-semibold text-slate-800">{((m.similarity || 0) * 100).toFixed(1)}%</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Semantic overlap:</span>
                                      <span className="font-semibold text-slate-800">{severity.label}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Confidence:</span>
                                      <span className="font-semibold text-slate-800">
                                        {m.embeddingSimilarity != null && m.embeddingSimilarity > 0.8 ? "High" : m.embeddingSimilarity != null && m.embeddingSimilarity > 0.5 ? "Moderate" : "Low"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
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

      {certVerifyResult ? (
        <section className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${
          certVerifyResult.verdict === "authentic"
            ? "border-emerald-300 bg-gradient-to-br from-white via-emerald-50/40 to-white"
            : certVerifyResult.verdict === "revoked"
            ? "border-amber-300 bg-gradient-to-br from-white via-amber-50/40 to-white"
            : certVerifyResult.verdict === "unknown"
            ? "border-slate-200 bg-white"
            : "border-rose-300 bg-gradient-to-br from-white via-rose-50/40 to-white"
        }`}>
          <VerdictBanner result={certVerifyResult} />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-900">Certificate Verification</h2>
            {certVerifyResult.matchedBy ? (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-300">
                matched by {certVerifyResult.matchedBy.replace(/_/g, " ")}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-slate-600">{certVerifyResult.message}</p>

          {certVerifyResult.stored ? (
            <article className="mt-4 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-emerald-50/40 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Stored Record</h3>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-mono text-slate-700 ring-1 ring-slate-300">
                  {certVerifyResult.stored.certificateId}
                </span>
              </div>
              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Issuer</dt>
                  <dd className="text-sm text-slate-800">{certVerifyResult.stored.issuerName}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Recipient</dt>
                  <dd className="text-sm text-slate-800">{certVerifyResult.stored.recipientName}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Course / Title</dt>
                  <dd className="text-sm text-slate-800">{certVerifyResult.stored.courseOrTitle}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Issue Date</dt>
                  <dd className="text-sm text-slate-800">{String(certVerifyResult.stored.issueDate).slice(0, 10)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Serial</dt>
                  <dd className="font-mono text-sm text-slate-800">{certVerifyResult.stored.certificateSerial}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Status</dt>
                  <dd className="text-sm text-slate-800">{certVerifyResult.stored.status}</dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {certVerifyResult.stored.blockchain?.transactionHash ? (
                  <p className="break-all text-[10px] font-mono text-slate-500">
                    TX: {certVerifyResult.stored.blockchain.transactionHash}
                  </p>
                ) : null}
              </div>
            </article>
          ) : null}

          {(certVerifyPreviewUrl || (certVerifyResult?.stored?.hasDocument && certVerifyResult?.stored?.documentUrl)) ? (
            <article className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Document Comparison</h3>
               
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Compare what you uploaded with the original on file.
                {certVerifyResult?.mismatches?.length ? (
                  <> Highlighted rows below show <strong>which fields changed</strong>.</>
                ) : null}
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Your Upload</p>
                    <div className="flex items-center gap-2">
                      {certVerifyFile ? (
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-mono text-slate-700">
                          {(certVerifyFile.size / 1024).toFixed(1)} KB
                        </span>
                      ) : null}
                      {certVerifyPreviewUrl ? (
                        <a
                          href={certVerifyPreviewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                          title="Open in a new tab"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          Open in new tab
                        </a>
                      ) : null}
                    </div>
                  </div>
                  {certVerifyPreviewUrl ? (
                    <div className="mt-2 h-[75vh] min-h-[400px] overflow-auto rounded border border-slate-200 bg-white">
                      {certVerifyFile?.type?.startsWith("image/") ? (
                        <img src={certVerifyPreviewUrl} alt="Uploaded certificate" className="block w-full" />
                      ) : (
                        <iframe src={certVerifyPreviewUrl} title="Uploaded certificate" className="h-full w-full" />
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-slate-400">No file selected.</p>
                  )}
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Stored in Database</p>
                    <div className="flex items-center gap-2">
                      {certVerifyResult?.stored?.certificateId ? (
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-mono text-slate-700">
                          {certVerifyResult.stored.certificateId}
                        </span>
                      ) : null}
                      {certVerifyResult?.stored?.hasDocument && certVerifyResult?.stored?.documentUrl ? (
                        <a
                          href={certVerifyResult.stored.documentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-50"
                          title="Open in a new tab"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          Open in new tab
                        </a>
                      ) : null}
                    </div>
                  </div>
                  {certVerifyResult?.stored?.hasDocument && certVerifyResult?.stored?.documentUrl ? (
                    <div className="mt-2 h-[75vh] min-h-[400px] rounded border border-slate-200 bg-white">
                      {certVerifyResult.stored.documentMime?.startsWith("image/") ? (
                        <img src={certVerifyResult.stored.documentUrl} alt="Stored certificate" className="block w-full" />
                      ) : (
                        <iframe src={`${certVerifyResult.stored.documentUrl}#view=FitH`} title="Stored certificate" className="h-full w-full" />
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-slate-400">
                      {certVerifyResult?.stored ? "No document stored." : "No matching certificate in database."}
                    </p>
                  )}
                </div>
              </div>
            </article>
          ) : null}

          {certVerifyResult.xaiAnalysis ? (
            <XaiReasoningPanel analysis={certVerifyResult.xaiAnalysis} />
          ) : null}

          {certVerifyResult.checks ? (
            <article className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Checks</h3>
              <ul className="mt-2 grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
                {[
                  {
                    label: "Blockchain",
                    pass: certVerifyResult.checks.blockchainAuthentic === true,
                    value: certVerifyResult.checks.blockchainAuthentic ? "✓ authentic on chain" : "✗ not on chain",
                  },
                  {
                    label: "Hash",
                    pass: certVerifyResult.checks.hashMatched === true,
                    value: certVerifyResult.checks.hashMatched ? "✓ matched" : "✗ no match",
                  },
                  {
                    label: "Fingerprint",
                    pass: certVerifyResult.checks.fingerprintMatched === true,
                    value: certVerifyResult.checks.fingerprintMatched ? "✓ matched" : "✗ no match",
                  },
                  {
                    label: "Serial",
                    pass: certVerifyResult.checks.serialMatched === true,
                    value: certVerifyResult.checks.serialMatched ? "✓ matched" : "✗ no match",
                  },
                  {
                    label: "Forgery risk",
                    pass: certVerifyResult.checks.forgeryRiskLevel === "low",
                    value: `${certVerifyResult.checks.forgeryRiskLevel || "—"}${certVerifyResult.checks.forgeryRiskScore != null ? ` (${certVerifyResult.checks.forgeryRiskScore})` : ""}`,
                  },
                  {
                    label: "OCR engine",
                    pass: true,
                    value: `${certVerifyResult.uploaded?.ocrEngine || "—"}${certVerifyResult.uploaded?.ocrConfidence != null ? ` · ${certVerifyResult.uploaded.ocrConfidence.toFixed(0)}%` : ""}`,
                  },
                ].map((c, i) => (
                  <li
                    key={i}
                    className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 ${
                      c.pass
                        ? "border-emerald-200 bg-emerald-50/70 text-emerald-800"
                        : "border-rose-200 bg-rose-50/70 text-rose-800"
                    }`}
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${c.pass ? "bg-emerald-500" : "bg-rose-500"}`} />
                    <span className="font-semibold uppercase tracking-wide text-[10px] opacity-80">{c.label}</span>
                    <span className="ml-auto font-mono text-[11px] font-semibold">{c.value}</span>
                  </li>
                ))}
              </ul>
            </article>
          ) : null}
        </section>
      ) : null}

      {certIssueResult ? (
        <section className="rounded-2xl border border-emerald-300 bg-gradient-to-br from-white via-emerald-50/40 to-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-900">Certificate Issued</h2>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-300">
              Anchored
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Certificate {certIssueResult.certificateId} has been stored and anchored on the blockchain.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <article className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Details</h3>
              <dl className="mt-2 grid gap-2 text-sm">
                <div><dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Certificate ID</dt>
                  <dd className="break-all font-mono text-slate-800">{certIssueResult.certificateId}</dd></div>
                <div><dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Recipient</dt>
                  <dd className="text-slate-800">{certIssueResult.recipientName}</dd></div>
                <div><dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Course</dt>
                  <dd className="text-slate-800">{certIssueResult.courseOrTitle}</dd></div>
                <div><dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Issue Date</dt>
                  <dd className="text-slate-800">{certIssueResult.issueDate}</dd></div>
                <div><dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Serial</dt>
                  <dd className="font-mono text-slate-800">{certIssueResult.certificateSerial}</dd></div>
              </dl>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-4 text-center">
              {certIssueResult.qrImageUrl ? (
                <img
                  src={certIssueResult.qrImageUrl}
                  alt="QR code"
                  className="mx-auto h-44 w-44 rounded-md border border-slate-200"
                />
              ) : null}
              <p className="mt-2 text-xs text-slate-500">Scan to verify</p>
              {certIssueResult.verifyUrl ? (
                <p className="mt-1 break-all text-[10px] font-mono text-slate-500">{certIssueResult.verifyUrl}</p>
              ) : null}
            </article>
          </div>

          {certIssueResult.blockchain ? (
            <article className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-700">
              <p><span className="font-semibold text-slate-900">TX:</span> <span className="break-all font-mono">{certIssueResult.blockchain.transactionHash}</span></p>
              <p><span className="font-semibold text-slate-900">Block:</span> {certIssueResult.blockchain.blockNumber} · <span className="font-semibold text-slate-900">Contract:</span> <span className="break-all font-mono">{certIssueResult.blockchain.contractAddress}</span></p>
              <p><span className="font-semibold text-slate-900">File hash:</span> <span className="break-all font-mono">{certIssueResult.fileHash}</span></p>
              <p><span className="font-semibold text-slate-900">Canonical fingerprint:</span> <span className="break-all font-mono">{certIssueResult.canonicalFingerprint}</span></p>
              {certIssueResult.documentUrl ? (
                <p className="mt-2">
                  <a
                    href={certIssueResult.documentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                  >
                    <span aria-hidden="true">📄</span> View Stored Document
                  </a>
                </p>
              ) : null}
            </article>
          ) : null}
        </section>
      ) : null}

      {result ? (
        <section className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${isVerified ? "border-emerald-300 bg-gradient-to-br from-white via-emerald-50/40 to-white" : "border-slate-200 bg-white"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-900">Final Result</h2>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${isVerified ? "bg-emerald-100 text-emerald-700 ring-emerald-300" : "bg-rose-100 text-rose-700 ring-rose-300"}`}>
              {isVerified ? "Accepted" : "Rejected"}
            </span>
            {totalTimeSeconds !== null ? (
              <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-mono font-semibold text-slate-600 ring-1 ring-slate-300">
                ✓ Completed in {formatElapsed(totalTimeSeconds)}
              </span>
            ) : null}
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

              {/* Primary metric: section coverage */}
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-3xl font-bold text-emerald-700">{authorship.originalPercentage}%</p>
                <span className="text-sm text-slate-600">original content</span>
                <span className="text-xs text-slate-500">
                  · {authorship.matchedPercentage}% of sections matched database
                </span>
              </div>

              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200/70">
                <div
                  className={`h-full rounded-full ${authorshipLevelStyle.bar} transition-all`}
                  style={{ width: `${authorship.originalPercentage}%` }}
                />
              </div>

              {/* Secondary metric: weighted semantic overlap */}
              

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
                    <div key={`success-sec-${secKey}`} className={`rounded-xl border ${topColor.border} ${topColor.bg} p-3`}>
                      {/* Section header */}
                      <div className="mb-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-lg text-slate-800">Section {secIndex}</span>
                          <span className="rounded-md bg-white/70 border border-slate-200 px-2 py-0.5 text-xs text-slate-600">
                            {matches.length} match{matches.length > 1 ? "es" : ""}
                          </span>
                        </div>
                        <div className="mt-1">
                          <span className={`inline-flex rounded-full px-3 py-0.5 text-sm font-bold ring-1 ${topColor.badge}`}>
                            Section Content Match: {(topSim * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      {/* Similarity progress bar */}
                      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-white/60">
                        <div
                          className={`h-full rounded-full transition-all ${
                            topSim >= 0.8 ? "bg-red-500" : topSim >= 0.5 ? "bg-amber-400" : "bg-yellow-400"
                          }`}
                          style={{ width: `${(topSim * 100).toFixed(1)}%` }}
                        />
                      </div>
                      {/* Side-by-side content */}
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                            YOUR DOCUMENT
                          </p>
                          <p className="max-h-36 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                            {matches[0]?.yourText || "(No uploaded text provided)"}
                          </p>
                        </div>
                        <div className="space-y-2">
                          {matches.map((m, i) => {
                            const severity = severityColors(m.similarity || 0);
                            return (
                              <div key={`${secKey}-m-${i}`} className={`rounded-lg border ${severity.border} bg-white/80 p-3`}>
                                {/* Source attribution */}
                                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">MATCHED SOURCE</p>
                                <div className="mb-3 rounded-md bg-slate-100/80 px-2 py-1.5">
                                  <p className="line-clamp-1 text-xs font-semibold text-slate-800" title={m.matchedTitle || m.matchedDocument}>
                                    {m.matchedTitle || m.matchedDocument || "Unknown"}
                                  </p>
                                  {m.matchedAuthors ? (
                                    <p className="truncate text-[10px] text-slate-500">by {m.matchedAuthors}</p>
                                  ) : null}
                                </div>
                                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">MATCHED DATABASE CONTENT</p>
                                <p className="mb-4 max-h-32 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                                  {m.matchedText ? highlightOverlap(m.matchedText, matches[0]?.yourText || "", 3) : "(No DB text)"}
                                </p>
                                {/* Coverage Analysis */}
                                
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
