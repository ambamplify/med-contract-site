import React, { useState, useEffect, useRef, Component, type ReactNode, type ErrorInfo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Shield, AlertTriangle, CheckCircle, XCircle, Download, ArrowLeft,
  Mail, X, Clock, ChevronDown, ExternalLink, Copy, Check, FileText,
  Clipboard, Printer, MessageCircle, Send, Bot,
} from "lucide-react";

// ──────────────────────────────────────────
// Brand mark — approved PNG icon
// ──────────────────────────────────────────
const BrandMark = ({ size = 32 }: { size?: number }) => (
  <img src="/images/brand-icon.png" width={size} height={size} alt="Internal Medicine & Hospitalist Contract Intel" style={{ borderRadius: '6px' }} />
);

// ──────────────────────────────────────────
// Error boundary — catches per-section crashes
// ──────────────────────────────────────────
class SectionErrorBoundary extends Component<
  { children: ReactNode; fallbackTitle?: string },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Section render error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 print-section">
          <p className="text-sm text-yellow-700 font-medium">
            {this.props.fallbackTitle || "This section"} could not be displayed.
          </p>
          <p className="text-xs text-yellow-600 mt-1">{this.state.error?.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ──────────────────────────────────────────
// Types & constants
// ──────────────────────────────────────────
interface AnalysisData {
  id: number;
  status: "awaiting_payment" | "pending" | "analyzing" | "complete" | "error";
  errorMessage?: string;
  employerType?: string;
  region?: string;
  state?: string;
  paymentStatus?: "unpaid" | "paid";
  email?: string; // FIX 5C: buyer email from Stripe, set at payment time
  result?: any;
}

// Section IDs for jump nav
const SECTIONS = [
  { id: "priority-card", label: "Top Priority" },
  { id: "exec-summary", label: "Executive Summary" },
  { id: "risk-strip", label: "Risk Overview" },
  { id: "compensation", label: "Compensation" },
  { id: "clause-analysis", label: "Clauses" },
  { id: "noncompete", label: "Non-Compete" },
  { id: "malpractice", label: "Malpractice" },
  { id: "termination", label: "Termination" },
  { id: "negotiation-approach", label: "Negotiation" },
  { id: "negotiation-priorities", label: "Priorities" },
  { id: "counter-proposal", label: "Counter-Proposal" },
  { id: "contract-chat", label: "Ask a Question" },
];

// ──────────────────────────────────────────
// Severity normalization
// ──────────────────────────────────────────
function normalizeSeverity(raw: string): "red" | "yellow" | "green" {
  const s = (raw || "").toLowerCase().trim();
  if (["red", "critical", "high", "severe", "significant"].includes(s)) return "red";
  if (["green", "low", "favorable", "good", "minimal"].includes(s)) return "green";
  return "yellow"; // moderate, medium, caution, etc.
}

// ──────────────────────────────────────────
// Copy-to-clipboard hook
// ──────────────────────────────────────────
function useCopyToClipboard() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };
  return { copiedId, copy };
}

// ──────────────────────────────────────────
// Hoisted presentational components
// (previously defined inside ReportPage, which caused them to remount on
// every render and broke React reconciliation — most visibly, focus loss
// in the chat textarea and counter-proposal flow.)
// ──────────────────────────────────────────
const formatLabel = (key: string): string =>
  key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^\s/, "").replace(/\b\w/g, (c) => c.toUpperCase());

const SeverityBadge = ({ severity }: { severity: string }) => {
  const norm = normalizeSeverity(severity);
  const colors: Record<string, string> = {
    red: "bg-red-100 text-red-700 border-red-200",
    yellow: "bg-yellow-100 text-yellow-700 border-yellow-200",
    green: "bg-green-100 text-green-700 border-green-200",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${colors[norm]}`}>
      {severity.toUpperCase()}
    </span>
  );
};

const ScoreCircle = ({ score, riskLevel }: { score: any; riskLevel: string }) => {
  const displayScore = typeof score === "number" ? score : parseInt(score) || "?";
  const norm = normalizeSeverity(riskLevel);
  const color = norm === "red" ? "text-red-500" : norm === "green" ? "text-green-500" : "text-yellow-500";
  const bgColor = norm === "red" ? "bg-red-50" : norm === "green" ? "bg-green-50" : "bg-yellow-50";
  const riskLabel = typeof displayScore === "number"
    ? (displayScore >= 80 ? "High Risk" : displayScore >= 60 ? "Moderate Risk" : displayScore >= 40 ? "Some Concerns" : "Favorable")
    : "";
  return (
    <div className="text-center flex-shrink-0">
      <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1">Risk Score</p>
      <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full ${bgColor}`}>
        <div className="text-center">
          <div className={`text-3xl font-bold ${color}`}>{displayScore}</div>
          <div className="text-xs text-gray-400">/100</div>
        </div>
      </div>
      <p className={`text-[10px] font-medium mt-1 ${color}`}>{riskLabel}</p>
    </div>
  );
};

const CopyButton = ({ text, id: btnId, label, copiedId, copy }: {
  text: string; id: string; label?: string; copiedId: string | null; copy: (t: string, id: string) => void;
}) => (
  <button
    onClick={() => copy(text, btnId)}
    className={`copy-btn inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium no-print ${
      copiedId === btnId ? "copied" : "text-gray-500 hover:text-gray-700"
    }`}
    title={label || "Copy to clipboard"}
  >
    {copiedId === btnId ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> {label || "Copy"}</>}
  </button>
);

const FlexValue = ({ value }: { value: any }) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  if (typeof value === "string" || typeof value === "number") return <span>{String(value)}</span>;
  if (Array.isArray(value)) {
    return (
      <ul className="space-y-1 mt-1">
        {value.map((item, i) => (
          <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">-</span>
            {typeof item === "object" ? <FlexObject data={item} /> : String(item)}
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") return <FlexObject data={value} />;
  return <span>{String(value)}</span>;
};

const FlexObject = ({ data: objData }: { data: Record<string, any> }) => {
  if (!objData || typeof objData !== "object") return null;
  return (
    <div className="space-y-2">
      {Object.entries(objData).map(([key, val]) => {
        if (val === null || val === undefined) return null;
        if (typeof val === "object" && !Array.isArray(val)) {
          return (
            <div key={key} className="bg-gray-50 rounded-lg p-3 mt-2">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">{formatLabel(key)}</p>
              <FlexObject data={val} />
            </div>
          );
        }
        if (Array.isArray(val)) {
          return (
            <div key={key} className="mt-1">
              <p className="text-xs text-gray-500 font-medium">{formatLabel(key)}</p>
              <FlexValue value={val} />
            </div>
          );
        }
        return (
          <div key={key} className="flex flex-wrap gap-x-2">
            <p className="text-xs text-gray-500 font-medium min-w-[120px]">{formatLabel(key)}:</p>
            <p className="text-sm text-gray-800"><FlexValue value={val} /></p>
          </div>
        );
      })}
    </div>
  );
};

const FlexSection = ({ title, data: secData, id: sectionId }: { title: string; data: any; id?: string }) => {
  if (!secData || typeof secData !== "object") return null;
  const severity = secData.severity || secData.riskLevel;
  const summaryFields: [string, string][] = [];
  const detailFields: [string, any][] = [];
  Object.entries(secData).forEach(([key, val]) => {
    if (key === "severity" || key === "riskLevel") return;
    if (typeof val === "string" && val.length > 100) summaryFields.push([key, val as string]);
    else detailFields.push([key, val]);
  });

  return (
    <div id={sectionId} className="bg-white rounded-xl shadow-md p-4 sm:p-6 print-section scroll-mt-24">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h2 className="text-lg font-bold text-gray-800">{title}</h2>
        {severity && <SeverityBadge severity={severity} />}
      </div>
      {detailFields.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          {detailFields.map(([key, val]) => {
            if (val === null || val === undefined) return null;
            if (typeof val === "object" && !Array.isArray(val)) {
              return (
                <div key={key} className="bg-gray-50 rounded-lg p-3 md:col-span-2">
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">{formatLabel(key)}</p>
                  <FlexObject data={val} />
                </div>
              );
            }
            if (Array.isArray(val)) {
              return (
                <div key={key} className="bg-gray-50 rounded-lg p-3 md:col-span-2">
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">{formatLabel(key)}</p>
                  <FlexValue value={val} />
                </div>
              );
            }
            return (
              <div key={key} className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{formatLabel(key)}</p>
                <p className="font-semibold text-sm text-gray-800">{typeof val === "boolean" ? (val ? "Yes" : "No") : String(val)}</p>
              </div>
            );
          })}
        </div>
      )}
      {summaryFields.map(([key, val]) => (
        <div key={key} className="mb-3">
          <p className="text-xs text-gray-500 font-medium mb-1">{formatLabel(key)}</p>
          <p className="text-sm text-gray-700">{val}</p>
        </div>
      ))}
    </div>
  );
};

// ──────────────────────────────────────────
// Main component
// ──────────────────────────────────────────
export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<AnalysisData | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const pollAttemptsRef = useRef(0);
  const pollFailuresRef = useRef(0);
  const MAX_POLL_ATTEMPTS = 240; // ~8 min at 2s interval
  const MAX_CONSECUTIVE_FAILURES = 20;
  const [networkErrorCount, setNetworkErrorCount] = useState(0);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailSkipped, setEmailSkipped] = useState(false);
  // FIX 5C: when the analysis has an auto-sent email (from Stripe at payment
  // time), store it here and show the "sent to [email]" banner instead of the
  // manual email input form.
  const [autoSentEmail, setAutoSentEmail] = useState<string | null>(null);
  const [autoSentBannerDismissed, setAutoSentBannerDismissed] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendResult, setResendResult] = useState<"success" | "error" | null>(null);
  const [showTimeout, setShowTimeout] = useState(false);
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [activeSection, setActiveSection] = useState("");
  const [counterLetter, setCounterLetter] = useState<string | null>(null);
  const [counterError, setCounterError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [counterLoading, setCounterLoading] = useState(false);
  const [counterTone, setCounterTone] = useState<"collaborative" | "firm">("collaborative");
  const [counterPurpose, setCounterPurpose] = useState<"new_contract" | "renegotiation">("new_contract");
  const [selectedPriorities, setSelectedPriorities] = useState<Set<number>>(new Set());
  const [expiredIncluded, setExpiredIncluded] = useState<Set<number>>(new Set());
  const [contractStartDate, setContractStartDate] = useState<string>("");
  const [startDateConfirmed, setStartDateConfirmed] = useState(false);
  const [startDateSkipped, setStartDateSkipped] = useState(false);
  const [emailShowCounterPrompt, setEmailShowCounterPrompt] = useState(false);
  const [letterEmailSent, setLetterEmailSent] = useState(false);
  const [letterEmailSending, setLetterEmailSending] = useState(false);
  const [qaEmailSent, setQaEmailSent] = useState(false);
  const [qaEmailSending, setQaEmailSending] = useState(false);
  const [qaEmailError, setQaEmailError] = useState<string | null>(null);
  // Hydrate chat history from localStorage so a refresh doesn't reset the
  // 15-question counter (the previous client-only counter was easily bypassed).
  // NOTE: this is hardening only — the real fix is server-side per-analysis
  // enforcement on the /chat endpoint.
  const chatStorageKey = id ? `em-chat-${id}` : "";
  const [chatMessages, setChatMessages] = useState<Array<{role: "user" | "assistant"; content: string}>>(() => {
    if (typeof window === "undefined" || !chatStorageKey) return [];
    try {
      const raw = window.localStorage.getItem(chatStorageKey);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  useEffect(() => {
    if (!chatStorageKey) return;
    try { window.localStorage.setItem(chatStorageKey, JSON.stringify(chatMessages)); } catch { /* quota exceeded */ }
  }, [chatMessages, chatStorageKey]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const analysisStartRef = useRef(Date.now());
  const hasShownModal = useRef(false);
  const { copiedId, copy } = useCopyToClipboard();

  const chatQuestionsUsed = chatMessages.filter(m => m.role === "user").length;
  const chatQuestionsRemaining = 15 - chatQuestionsUsed;

  const sendLetterEmail = async () => {
    setLetterEmailSending(true);
    try {
      const res = await fetch(`/api/analyze/${id}/send-letter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) setLetterEmailSent(true);
    } finally {
      setLetterEmailSending(false);
    }
  };

  // FIX 2: email the Q&A transcript to the user
  const sendQaEmail = async () => {
    if (!email) return;
    setQaEmailSending(true);
    setQaEmailError(null);
    try {
      const res = await fetch(`/api/analyze/${id}/send-qa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setQaEmailSent(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setQaEmailError(data.error || `Server error (${res.status})`);
      }
    } catch (e: any) {
      setQaEmailError(e?.message || "Network error");
    } finally {
      setQaEmailSending(false);
    }
  };

  const sendChatMessage = async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading || chatQuestionsRemaining <= 0) return;

    const newMessages = [...chatMessages, { role: "user" as const, content: msg }];
    setChatMessages(newMessages);
    setChatInput("");
    setChatLoading(true);

    try {
      const res = await fetch(`/api/analyze/${id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          history: chatMessages, // send prior history for context
        }),
      });
      const json = await res.json();
      if (json.reply) {
        setChatMessages([...newMessages, { role: "assistant", content: json.reply }]);
      } else {
        setChatMessages([...newMessages, { role: "assistant", content: "Sorry, I couldn't process that question. Please try again." }]);
      }
    } catch {
      setChatMessages([...newMessages, { role: "assistant", content: "Network error. Please try again." }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  // Poll for status — capped at MAX_POLL_ATTEMPTS, surfaces errors after
  // MAX_CONSECUTIVE_FAILURES network failures so the UI doesn't silently hang.
  useEffect(() => {
    if (!id) return;
    let active = true;
    let interval: ReturnType<typeof setInterval>;
    pollAttemptsRef.current = 0;
    pollFailuresRef.current = 0;
    const poll = async () => {
      pollAttemptsRef.current += 1;
      if (pollAttemptsRef.current > MAX_POLL_ATTEMPTS) {
        clearInterval(interval);
        setPollError("Analysis is taking longer than expected. Please refresh the page or start a new analysis.");
        return;
      }
      try {
        const res = await fetch(`/api/analyze/${id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!active) return;
        // Clear network error count on any successful response
        pollFailuresRef.current = 0;
        setNetworkErrorCount(0);
        setData(json);
        if (json.status === "complete" || json.status === "error") clearInterval(interval);
      } catch (err) {
        if (!active) return;
        pollFailuresRef.current += 1;
        setNetworkErrorCount(pollFailuresRef.current);
        // Hard-stop only after MAX_CONSECUTIVE_FAILURES — soft warning shows at 3
        if (pollFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
          clearInterval(interval);
          setPollError("Analysis is still processing on the server. Please refresh the page to check your results.");
        }
      }
    };
    poll();
    interval = setInterval(poll, 2000);
    return () => { active = false; clearInterval(interval); };
  }, [id]);

  // Reset on new analysis
  useEffect(() => {
    if (data?.status === "analyzing") {
      analysisStartRef.current = Date.now();
      setShowTimeout(false);
    }
  }, [data?.status]);

  // Timeout warning at 6 minutes
  useEffect(() => {
    if (data?.status !== "analyzing" && data?.status !== "pending") return;
    const timer = setTimeout(() => setShowTimeout(true), 360000);
    return () => clearTimeout(timer);
  }, [data?.status]);

  // Rotating progress messages — changes every 30 seconds while loading
  const LOADING_MESSAGES = [
    "Reading contract language...",
    "Benchmarking compensation against MGMA 2025 data...",
    "Analyzing non-compete provisions...",
    "Reviewing malpractice and tail coverage...",
    "Generating negotiation priorities...",
    "Building your report...",
  ];
  useEffect(() => {
    if (data?.status !== "analyzing" && data?.status !== "pending") return;
    setLoadingMsgIndex(0);
    const interval = setInterval(() => {
      setLoadingMsgIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 30000);
    return () => clearInterval(interval);
  }, [data?.status]);

  // Elapsed time counter — updates every second while loading
  useEffect(() => {
    if (data?.status !== "analyzing" && data?.status !== "pending") return;
    setElapsedSeconds(0);
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [data?.status]);

  // FIX 5C: on completion, check for auto-sent email first.
  // If present → show the "sent to [email]" confirmation banner.
  // If absent → show the manual email input form after a short delay.
  useEffect(() => {
    if (data?.status === "complete" && !hasShownModal.current) {
      hasShownModal.current = true;
      if (data.email) {
        // Auto-email was triggered server-side at payment time — surface it.
        setAutoSentEmail(data.email);
        setEmail(data.email); // pre-fill for Resend flow
      } else if (!emailSkipped) {
        // No auto-email on file — fall back to manual prompt.
        const timer = setTimeout(() => setShowEmailModal(true), 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [data?.status, data?.email, emailSkipped]);

  // Scroll spy for section nav
  useEffect(() => {
    if (data?.status !== "complete") return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: "-20% 0px -60% 0px" }
    );
    SECTIONS.forEach(({ id: sectionId }) => {
      const el = document.getElementById(sectionId);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [data?.status]);

  // Auto-select all priorities for counter-proposal (only active ones by default)
  useEffect(() => {
    if (data?.status === "complete" && data?.result?.negotiationPriorities?.length > 0) {
      const activeIndices = data.result.negotiationPriorities
        .map((_: any, i: number) => i)
        .filter((i: number) => !data.result.negotiationPriorities[i]?.isOneTime);
      setSelectedPriorities(new Set(activeIndices.length > 0 ? activeIndices : data.result.negotiationPriorities.map((_: any, i: number) => i)));
    }
  }, [data?.status]);

  // Pre-fill contract start date from analysis
  useEffect(() => {
    if (data?.status === "complete" && data?.result?.contractStartDate) {
      setContractStartDate(data.result.contractStartDate);
    }
  }, [data?.status]);

  const handleEmailSubmit = async (skipCounterCheck = false) => {
    setEmailError(null);
    if (!email.includes("@") || !email.includes(".")) {
      setEmailError("Please enter a valid email address.");
      return;
    }

    // If no counter-proposal generated yet, ask first
    if (!skipCounterCheck && !counterLetter) {
      setEmailShowCounterPrompt(true);
      return;
    }

    setEmailShowCounterPrompt(false);
    try {
      const res = await fetch(`/api/analyze/${id}/email`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, phone: phone.trim() || undefined }),
      });
      if (!res.ok) throw new Error(`Server error (${res.status})`);
      // FIX 1: distinguish "email saved" from "email actually sent"
      const data = await res.json().catch(() => ({}));
      if (data && data.emailSent === false) {
        setEmailError(
          `We saved your email but the delivery failed${data.error ? ` (${data.error})` : ""}. Please download the PDF directly below, or contact service@medcontractintel.com.`
        );
        downloadPDF();
        return;
      }
      setEmailSent(true);
      downloadPDF();
      setTimeout(() => setShowEmailModal(false), 3000);
    } catch (err: any) {
      setEmailError("We couldn't send your email. Please try again or download directly.");
    }
  };

  // FIX 5C: Resend the auto-email report (fallback if inbox delivery failed).
  const handleResend = async () => {
    if (!email || resending) return;
    setResending(true);
    setResendResult(null);
    try {
      const res = await fetch(`/api/analyze/${id}/email`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json().catch(() => ({}));
      setResendResult(json.emailSent !== false ? "success" : "error");
    } catch {
      setResendResult("error");
    } finally {
      setResending(false);
    }
  };

  // Use a hidden <a download> instead of window.open so popup blockers
  // (and iOS Safari, which is hostile to window.open) don't eat the download.
  const downloadPDF = () => {
    if (!id) return;
    const a = document.createElement("a");
    a.href = `/api/analyze/${id}/pdf`;
    a.download = `em-contract-analysis-${id}.pdf`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  const skipEmail = () => { setEmailSkipped(true); setShowEmailModal(false); };

  const generateCounterProposal = async () => {
    setCounterLoading(true);
    setCounterLetter(null);
    setCounterError(null);
    try {
      const res = await fetch(`/api/analyze/${id}/counter-proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tone: counterTone,
          purpose: counterPurpose,
          selectedPriorities: Array.from(selectedPriorities),
          contractStartDate: counterPurpose === "renegotiation" ? contractStartDate : undefined,
          expiredIncluded: counterPurpose === "renegotiation" ? Array.from(expiredIncluded) : undefined,
        }),
      });
      if (!res.ok) throw new Error(`Server error (${res.status})`);
      const json = await res.json();
      if (json.letter) {
        setCounterLetter(json.letter);
      } else {
        setCounterError("We couldn't generate your letter. Please try again.");
      }
    } catch (err: any) {
      setCounterError(err?.message?.includes("Server")
        ? err.message
        : "Network error. Check your connection and try again.");
    } finally {
      setCounterLoading(false);
    }
  };

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ─── Polling failure ───
  if (pollError) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0f1e3d] to-[#1a2d5a] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-800 mb-2">Connection Lost</h2>
          <p className="text-gray-600 text-sm mb-2">Your analysis may have completed in the background.</p>
          <p className="text-gray-500 text-xs mb-6">Click <strong>Refresh</strong> to check — if it finished you will see your report immediately.</p>
          <button onClick={() => window.location.reload()} className="w-full bg-[#c9a84c] text-[#0f1e3d] font-bold py-3 px-5 rounded-lg hover:bg-[#d4b85c] transition-colors mb-2 text-sm">
            Refresh — Check for Results
          </button>
          <button onClick={() => navigate("/")} className="w-full bg-transparent text-gray-400 font-medium py-2 px-5 rounded-lg hover:text-gray-600 transition-colors text-xs">
            Start a new analysis
          </button>
        </div>
      </div>
    );
  }

  // ─── Loading state — also covers awaiting_payment (webhook in flight) ───
  // After Stripe redirects back the row may still be in "awaiting_payment"
  // state for a few seconds until the webhook flips it to "pending". Treat
  // all three as "loading" so the user sees the analyzer screen immediately.
  if (!data || data.status === "awaiting_payment" || data.status === "pending" || data.status === "analyzing") {
    const elapsedMin = Math.floor(elapsedSeconds / 60);
    const elapsedSec = elapsedSeconds % 60;
    const elapsedFormatted = `${elapsedMin}:${String(elapsedSec).padStart(2, "0")}`;
    const LOADING_MESSAGES_LOCAL = [
      "Reading contract language...",
      "Benchmarking compensation against MGMA 2025 data...",
      "Analyzing non-compete provisions...",
      "Reviewing malpractice and tail coverage...",
      "Generating negotiation priorities...",
      "Building your report...",
    ];
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0f1e3d] to-[#1a2d5a] flex flex-col items-center justify-center px-4">
        {/* Brand header — outside the white card, on navy background */}
        <div className="text-center mb-6">
          <img
            src="/assets/images/brand_mark.png"
            alt="MedContractIntel™"
            width="140"
            height="140"
            style={{ objectFit: "contain" }}
            className="mx-auto"
          />
          <h1 className="text-xl font-bold text-white mt-3">MedContractIntel<sup style={{ fontSize: "0.5em", verticalAlign: "super" }}>™</sup></h1>
          <p className="text-[11px] text-[#c9a84c] font-semibold tracking-widest uppercase mt-1">
            Data. Leverage. Fair Pay.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-md w-full">
          {/* Gold indeterminate spinner + static status */}
          <div className="flex flex-col items-center justify-center py-6">
            <div className="w-12 h-12 rounded-full border-4 border-[#f0e0a0] border-t-[#c9a84c] animate-spin mb-6" />
            <p className="text-base font-semibold text-gray-800">Analyzing your contract</p>
            <p className="text-sm text-gray-500 mt-1">This typically takes 3–5 minutes.</p>
            {/* Payment-return confirmation — shown only while the server is
                flipping the row from awaiting_payment to pending after the
                Stripe webhook arrives. Usually visible for ~1-3 seconds. */}
            {data?.status === "awaiting_payment" && (
              <p className="text-xs font-medium text-[#1a9090] mt-3">
                ✓ Payment confirmed — your analysis is starting.
              </p>
            )}
            <p className="text-xs text-gray-400 mt-4">{elapsedFormatted}</p>
          </div>

          {/* Soft network warning — shown after 3 consecutive poll failures, clears on success */}
          {networkErrorCount >= 3 && !pollError && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3 flex items-center gap-2">
              <span className="text-yellow-600 text-sm">⚠</span>
              <p className="text-xs text-yellow-800">
                Intermittent connection issue — still checking your analysis. Please wait...
              </p>
            </div>
          )}

          {/* Extended-time message after 6 minutes */}
          {showTimeout && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-2">
              <div className="flex items-start gap-2">
                <Clock className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="text-left">
                  <p className="text-sm text-blue-800">
                    Still working — longer contracts take more time. Hang tight. If this continues, email{" "}
                    <a href="mailto:service@medcontractintel.com" className="underline font-medium">service@medcontractintel.com</a>
                    {" "}with your order number and we will re-run your analysis within 2 hours at no charge.
                  </p>
                  <button onClick={() => navigate("/")} className="mt-2 text-sm font-medium text-[#0f1e3d] hover:underline">
                    Start Over
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Error state ───
  if (data.status === "error") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0f1e3d] to-[#1a2d5a] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-[#0f1e3d] to-[#1a2d5a] mb-4">
            <Shield className="h-8 w-8 text-[#c9a84c]" />
          </div>
          <h1 className="text-lg font-bold text-[#0f1e3d] mb-1">MedContractIntel<sup style={{ fontSize: "0.5em", verticalAlign: "super" }}>™</sup></h1>
          <div className="w-12 h-0.5 bg-[#2ec4b6] mx-auto mt-2 mb-4 rounded-full" />
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-800 mb-2">Analysis Failed</h2>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-red-800 mb-2">
              Your analysis encountered an error. This sometimes happens with scanned PDFs or very long contracts.
            </p>
            <p className="text-sm text-red-700">
              Email <a href="mailto:service@medcontractintel.com" className="underline font-medium">service@medcontractintel.com</a> with your order number and we will re-run your analysis within 2 hours at no charge.
            </p>
          </div>
          <button onClick={() => navigate("/")} className="bg-[#0f1e3d] text-white font-medium py-2.5 px-6 rounded-lg hover:bg-[#1a2d5a] transition-colors">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ─── Complete — render report ───
  const result = data.result;
  if (!result || typeof result !== "object") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
        <div className="bg-white rounded-xl shadow-md p-8 max-w-md w-full text-center">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-800 mb-2">Report data unavailable</h2>
          <p className="text-gray-500 text-sm mb-4">The analysis completed but the report data could not be loaded.</p>
          <button onClick={() => navigate("/")} className="bg-[#0f1e3d] text-white font-medium py-2.5 px-6 rounded-lg hover:bg-[#1a2d5a] transition-colors">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────
  // Extract data with alternate field name fallbacks
  // ──────────────────────────────────────────
  const es = result.executiveSummary || {};
  const esScore = es.overallScore ?? es.overall_score ?? es.overallRiskScore ?? es.overall_risk_score ?? es.score ?? es.riskScore ?? es.risk_score ?? 0;
  const esRisk = es.riskLevel ?? es.risk_level ?? es.risk ?? es.overallRiskRating ?? es.overall_risk_rating ?? "moderate";
  const esConcerns = es.topConcerns ?? es.top_concerns ?? es.concerns ?? es.redFlags ?? es.red_flags ?? es.keyRedFlags ?? es.key_red_flags ?? es.keyFindings ?? es.key_findings ?? [];
  const esStrengths = es.topStrengths ?? es.top_strengths ?? es.strengths ?? es.positives ?? es.keyStrengths ?? es.key_strengths ?? [];
  const esSummary = es.summary ?? es.overview ?? es.narrativeSummary ?? es.narrative_summary ?? "";

  const na = result.negotiationApproach || {};
  const naStrategy = na.overallStrategy ?? na.overall_strategy ?? na.strategy ?? na.summary ?? "";
  const naOpening = na.openingMove ?? na.opening_move ?? na.firstStep ?? "";
  const naPrinciples = na.keyPrinciples ?? na.key_principles ?? na.principles ?? na.leveragePoints ?? na.leverage_points ?? [];
  const naSteps = na.sequencing ?? na.steps ?? na.sequence ?? na.negotiationTactics ?? na.negotiation_tactics ?? na.tactics ?? [];
  const naPrioritizedAsks = na.prioritizedAskList ?? na.prioritized_ask_list ?? na.askList ?? [];
  const naWalkAway = na.walkAwayThreshold ?? na.walk_away_threshold ?? na.walkAway ?? "";

  // Build risk summary strip data
  const riskStrip = [
    { label: "Compensation", severity: normalizeSeverity(result.compensation?.severity ?? result.compensation?.riskLevel ?? (esScore > 70 ? "high" : esScore > 50 ? "moderate" : "low")) },
    { label: "Non-Compete", severity: normalizeSeverity(result.noncompete?.severity ?? result.noncompete?.riskLevel ?? "moderate") },
    { label: "Malpractice", severity: normalizeSeverity(result.malpractice?.severity ?? result.malpractice?.riskLevel ?? "moderate") },
    { label: "Termination", severity: normalizeSeverity(result.terminationProvisions?.severity ?? result.terminationProvisions?.riskLevel ?? "moderate") },
  ];

  const priorities = result.negotiationPriorities || [];

  // ──────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* FIX 5C: Auto-sent confirmation banner — shown when Stripe captured the
          buyer email at payment time and the server auto-sent the report. */}
      {autoSentEmail && !autoSentBannerDismissed && (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-5 no-print animate-slide-up">
          <div className="max-w-2xl mx-auto bg-gradient-to-r from-[#0a3d2e] to-[#0f4f3a] rounded-2xl shadow-2xl border border-[#2ec4b6]/40 p-5 relative">
            <button onClick={() => setAutoSentBannerDismissed(true)} className="absolute top-3 right-4 text-gray-400 hover:text-white transition-colors">
              <X className="h-5 w-5" />
            </button>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#2ec4b6]/20 flex items-center justify-center mt-0.5">
                <CheckCircle className="h-5 w-5 text-[#2ec4b6]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-base">Your report has been sent to {autoSentEmail}</p>
                <p className="text-gray-300 text-xs mt-0.5">Check your inbox — the PDF analysis is waiting for you.</p>
                {resendResult === "success" && (
                  <p className="text-[#2ec4b6] text-xs mt-1 font-medium">Resent successfully.</p>
                )}
                {resendResult === "error" && (
                  <p className="text-red-300 text-xs mt-1">Resend failed. Please download the PDF directly.</p>
                )}
              </div>
              <button
                onClick={handleResend}
                disabled={resending}
                className="flex-shrink-0 text-xs text-[#2ec4b6] border border-[#2ec4b6]/40 px-3 py-1.5 rounded-lg hover:bg-[#2ec4b6]/10 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {resending ? "Sending…" : "Resend report"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Banner — manual prompt, shown when no auto-sent email is on file */}
      {showEmailModal && !autoSentEmail && (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-5 no-print animate-slide-up">
          <div className="max-w-2xl mx-auto bg-gradient-to-r from-[#0f1e3d] to-[#1a2d5a] rounded-2xl shadow-2xl border border-[#c9a84c]/30 p-5 relative">
            <button onClick={skipEmail} className="absolute top-3 right-4 text-gray-400 hover:text-white transition-colors">
              <X className="h-5 w-5" />
            </button>
            {emailSent ? (
              <div className="flex items-center gap-3 justify-center py-2">
                <CheckCircle className="h-6 w-6 text-[#2ec4b6]" />
                <p className="text-white font-semibold">Report sent! Check your inbox.</p>
              </div>
            ) : emailShowCounterPrompt ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#c9a84c]/20 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-[#c9a84c]" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-base">Generate a counter-proposal first?</p>
                    <p className="text-gray-400 text-xs">We can include a professional negotiation letter with your report email</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEmailShowCounterPrompt(false);
                      setShowEmailModal(false);
                      setEmailSkipped(false);
                      scrollToSection("counter-proposal");
                    }}
                    className="flex-1 bg-[#c9a84c] text-[#0f1e3d] font-bold py-3 rounded-lg hover:bg-[#d4b85c] transition-colors text-sm shadow-lg"
                  >
                    Yes, generate letter first
                  </button>
                  <button
                    onClick={() => handleEmailSubmit(true)}
                    className="flex-1 border border-white/30 text-white font-medium py-3 rounded-lg hover:bg-white/10 transition-colors text-sm"
                  >
                    Skip — just send the report
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#c9a84c]/20 flex items-center justify-center">
                    <Mail className="h-5 w-5 text-[#c9a84c]" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-base">Get your full report delivered</p>
                    <p className="text-gray-400 text-xs">
                      {counterLetter
                        ? "We'll email your PDF analysis and counter-proposal letter"
                        : "We'll email your PDF analysis so you have it for negotiations"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(null); }}
                    placeholder="your-email@hospital.org"
                    className="flex-1 rounded-lg border border-[#c9a84c]/40 bg-white/10 text-white placeholder-gray-400 px-4 py-3 text-base sm:text-sm focus:border-[#c9a84c] focus:ring-2 focus:ring-[#c9a84c]/50 outline-none"
                    onKeyDown={(e) => e.key === "Enter" && handleEmailSubmit()}
                  />
                  <button onClick={() => handleEmailSubmit()} className="bg-[#c9a84c] text-[#0f1e3d] font-bold px-6 py-3 rounded-lg hover:bg-[#d4b85c] transition-colors text-sm whitespace-nowrap shadow-lg">
                    Send PDF
                  </button>
                </div>
                <div>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 555-5555 — optional"
                    className="w-full rounded-lg border border-white/20 bg-white/10 text-white placeholder-gray-500 px-4 py-2.5 text-sm focus:border-[#c9a84c]/60 focus:ring-1 focus:ring-[#c9a84c]/40 outline-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">For SMS updates on your analysis. We never share your number.</p>
                </div>
                {emailError && (
                  <p role="alert" className="text-xs text-red-300 -mt-1">{emailError}</p>
                )}
                <button onClick={skipEmail} className="text-gray-500 hover:text-gray-300 text-xs text-center transition-colors">
                  No thanks, I'll download it myself
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header — wraps onto two rows on phones so buttons don't collide with the title */}
      <div className="bg-[#0f1e3d] text-white">
        <div className="max-w-6xl mx-auto px-4 py-5 sm:py-6">
          <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <button onClick={() => navigate("/")} className="flex items-center gap-1 text-gray-300 hover:text-white text-sm mb-2 no-print">
                <ArrowLeft className="h-4 w-4" /> New Analysis
              </button>
              <div className="flex items-center gap-2.5">
                <BrandMark size={32} />
                <h1 className="text-xl sm:text-2xl font-bold">MedContractIntel<sup style={{ fontSize: "0.5em", verticalAlign: "super" }}>™</sup></h1>
              </div>
              {data.employerType && data.employerType !== "Unknown" && (
                <p className="text-[#c9a84c] font-medium mt-1 text-sm sm:text-base truncate">Analysis: {data.employerType} Contract</p>
              )}
            </div>
            <div className="flex items-center gap-2 no-print w-full sm:w-auto">
              <button onClick={() => window.print()} className="flex items-center justify-center gap-2 border border-white/30 text-white font-medium px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-sm flex-1 sm:flex-initial">
                <Printer className="h-4 w-4" /> Print
              </button>
              <button onClick={downloadPDF} className="flex items-center justify-center gap-2 bg-[#c9a84c] text-[#0f1e3d] font-semibold px-4 py-2 rounded-lg hover:bg-[#d4b85c] transition-colors flex-1 sm:flex-initial">
                <Download className="h-4 w-4" /> <span className="whitespace-nowrap">Download PDF</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile section nav — sticky dropdown, hidden on lg+ */}
      <div className="lg:hidden sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm no-print">
        <button
          onClick={() => setMobileNavOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700"
          aria-expanded={mobileNavOpen}
          aria-label="Jump to section"
        >
          <span className="truncate">
            {SECTIONS.find((s) => s.id === activeSection)?.label || "Jump to section"}
          </span>
          <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform flex-shrink-0 ml-2 ${mobileNavOpen ? "rotate-180" : ""}`} />
        </button>
        {mobileNavOpen && (
          <div className="border-t border-gray-100 max-h-72 overflow-y-auto">
            {SECTIONS.map(({ id: sId, label }) => (
              <button
                key={sId}
                onClick={() => { scrollToSection(sId); setMobileNavOpen(false); }}
                className={`block w-full text-left text-sm px-4 py-2.5 transition-colors ${
                  activeSection === sId
                    ? "bg-[#0f1e3d] text-white font-medium"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Layout: sidebar nav + content */}
      <div className="max-w-6xl mx-auto px-4 py-6 flex gap-6">
        {/* Section jump nav (desktop only) */}
        <nav className="hidden lg:block w-48 flex-shrink-0 no-print">
          <div className="section-nav">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Sections</p>
            <div className="space-y-1">
              {SECTIONS.map(({ id: sId, label }) => (
                <button
                  key={sId}
                  onClick={() => scrollToSection(sId)}
                  className={`block w-full text-left text-sm px-3 py-1.5 rounded-lg transition-colors ${
                    activeSection === sId
                      ? "bg-[#0f1e3d] text-white font-medium"
                      : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </nav>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* REPORT HEADER — small context line above the score strip */}
          {(data.employerType || data.region || data.state) && (
            <p className="text-xs text-gray-500 -mb-2 print-section">
              {[
                data.employerType ? `${data.employerType} Contract` : null,
                data.region || data.state || null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}

          {/* RISK SUMMARY STRIP */}
          <div id="risk-strip" className="bg-white rounded-xl shadow-md p-4 print-section scroll-mt-24">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {riskStrip.map(({ label, severity }) => {
                const dotColor = severity === "red" ? "bg-red-500" : severity === "green" ? "bg-green-500" : "bg-yellow-500";
                const bgColor = severity === "red" ? "bg-red-50" : severity === "green" ? "bg-green-50" : "bg-yellow-50";
                return (
                  <div key={label} className={`${bgColor} rounded-lg p-3 text-center`}>
                    <div className={`w-3 h-3 rounded-full ${dotColor} mx-auto mb-1.5`} />
                    <p className="text-xs font-semibold text-gray-700">{label}</p>
                    <p className="text-[10px] text-gray-500 capitalize">{severity === "red" ? "High Risk" : severity === "green" ? "Low Risk" : "Moderate"}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* #1 PRIORITY CARD */}
          <SectionErrorBoundary fallbackTitle="Priority card">
          {priorities.length > 0 && (() => {
            const p0 = priorities[0];
            const p0Name = p0?.clause ?? p0?.clauseName ?? p0?.name ?? p0?.issue ?? "Review your contract";
            const p0Desc = p0?.rationale ?? p0?.reason ?? p0?.description ?? p0?.financialImpact ?? "";
            return (
            <div id="priority-card" className="bg-white rounded-xl shadow-md border-l-4 border-[#c9a84c] p-4 sm:p-6 print-section scroll-mt-24">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-[#c9a84c] text-sm font-semibold uppercase tracking-wide mb-1">
                    Your #1 Negotiation Priority
                  </p>
                  <h3 className="text-lg font-bold text-gray-800 mb-2">{p0Name}</h3>
                  <p className="text-gray-600 text-sm">{p0Desc}</p>
                </div>
              </div>
              <button
                onClick={() => scrollToSection("negotiation-priorities")}
                className="mt-3 text-sm text-[#0f1e3d] font-medium hover:underline flex items-center gap-1 no-print"
              >
                See full negotiation strategy <ChevronDown className="h-3 w-3" />
              </button>
            </div>
            );
          })()}
          </SectionErrorBoundary>

          {/* EXECUTIVE SUMMARY */}
          <SectionErrorBoundary fallbackTitle="Executive Summary">
          {result.executiveSummary && (
          <div id="exec-summary" className="bg-white rounded-xl shadow-md p-4 sm:p-6 print-section scroll-mt-24">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Executive Summary</h2>
            <div className="flex flex-col sm:flex-row items-start gap-6">
              <ScoreCircle score={esScore} riskLevel={esRisk} />
              <div className="flex-1">
                <div className="mb-3">
                  <SeverityBadge severity={esRisk} />
                  <span className="text-xs text-gray-400 ml-2">
                    {typeof esScore === "number" ? "Risk Score: 0-39 Favorable for You | 40-59 Some Concerns | 60-79 Moderate Risk | 80+ High Risk" : ""}
                  </span>
                </div>
                {esSummary && <p className="text-sm text-gray-700 mb-3">{esSummary}</p>}
                {esConcerns.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-gray-700 mb-1">Top Concerns</p>
                    <ul className="space-y-1">
                      {esConcerns.map((c: any, i: number) => (
                        <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" /> {typeof c === "object" ? JSON.stringify(c) : c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {esStrengths.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-1">Strengths</p>
                    <ul className="space-y-1">
                      {esStrengths.map((s: any, i: number) => (
                        <li key={i} className="text-sm text-green-700 flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5" /> {typeof s === "object" ? JSON.stringify(s) : s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
          )}
          </SectionErrorBoundary>

          {/* COMPENSATION */}
          <SectionErrorBoundary fallbackTitle="Compensation Analysis">
          {result.compensation && <FlexSection title="Compensation Analysis" data={result.compensation} id="compensation" />}
          </SectionErrorBoundary>

          {/* UPSELL: RVU Playbook — RVU-based contracts only */}
          {result.compensation?.rvu?.multiplier > 0 && result.compensation?.rvu?.rvuType !== "NOT_APPLICABLE" && (
          <div className="no-print bg-gradient-to-r from-[#1a2744] to-[#1a6b6b] rounded-xl p-4 sm:p-5 text-white">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#c9a84c] mb-1">Maximize your RVU income</p>
                <h3 className="font-bold text-white text-base">IM wRVU Playbook</h3>
                <p className="text-sm text-gray-300 mt-1">Learn how to negotiate your conversion factor, spot APC haircut clauses, and track your production. The guide your employer doesn't want you to have.</p>
              </div>
              <a href="https://buy.stripe.com/8x2bJ3550cAMdFb0hT3ZK06" target="_blank" rel="noopener noreferrer"
                className="flex-shrink-0 self-start sm:self-center bg-[#c9a84c] hover:bg-[#b8973b] text-[#0f1e3d] font-bold px-5 py-2.5 rounded-lg text-sm transition-colors whitespace-nowrap">
                Get it — $67
              </a>
            </div>
          </div>
          )}

          {/* CLAUSE ANALYSIS */}
          <SectionErrorBoundary fallbackTitle="Clause Analysis">
          {result.clauseAnalysis?.length > 0 && (
          <div id="clause-analysis" className="bg-white rounded-xl shadow-md p-4 sm:p-6 print-section scroll-mt-24">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Clause-by-Clause Analysis</h2>
            <div className="space-y-3">
              {result.clauseAnalysis.map((clause: any, i: number) => {
                const cName = clause?.clauseName ?? clause?.clauseTitle ?? clause?.name ?? clause?.title ?? `Clause ${i + 1}`;
                const cSeverity = normalizeSeverity(clause?.severity ?? clause?.riskLevel ?? clause?.risk_level ?? "yellow");
                const cSummary = clause?.summary ?? clause?.analysis ?? clause?.description ?? "";
                const cMeaning = clause?.whatItMeans ?? clause?.what_it_means ?? clause?.impact ?? clause?.implications ?? "";
                const cNorm = clause?.industryNorm ?? clause?.industry_norm ?? clause?.benchmark ?? clause?.marketComparison ?? "";
                const cRec = clause?.recommendation ?? clause?.suggestedLanguage ?? clause?.suggested_language ?? "";
                const cLang = clause?.contractLanguage ?? clause?.contract_language ?? clause?.extractedText ?? "";
                return (
                <div key={i} className={`severity-${cSeverity} rounded-lg p-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-800">{cName}</h3>
                    <SeverityBadge severity={cSeverity} />
                  </div>
                  {cLang && <p className="text-sm text-gray-500 italic mb-2 border-l-2 border-gray-300 pl-3">{cLang.length > 200 ? cLang.substring(0, 200) + "..." : cLang}</p>}
                  <p className="text-sm text-gray-700 mb-2">{cSummary}</p>
                  {cMeaning && <p className="text-sm text-gray-600 mb-1"><strong>What it means:</strong> {cMeaning}</p>}
                  {cNorm && <p className="text-sm text-gray-500 mb-1"><strong>Industry norm:</strong> {cNorm}</p>}
                  {cRec && <p className="text-sm text-green-700"><strong>Recommendation:</strong> {cRec}</p>}
                </div>
                );
              })}
            </div>
          </div>
          )}
          </SectionErrorBoundary>

          {/* NON-COMPETE */}
          <SectionErrorBoundary fallbackTitle="Non-Compete Analysis">
          {result.noncompete && <FlexSection title="Non-Compete Analysis" data={result.noncompete} id="noncompete" />}
          </SectionErrorBoundary>

          {/* MALPRACTICE */}
          <SectionErrorBoundary fallbackTitle="Malpractice Insurance">
          {result.malpractice && <FlexSection title="Malpractice Insurance" data={result.malpractice} id="malpractice" />}
          </SectionErrorBoundary>

          {/* TERMINATION */}
          <SectionErrorBoundary fallbackTitle="Termination Provisions">
          {result.terminationProvisions && <FlexSection title="Termination Provisions" data={result.terminationProvisions} id="termination" />}
          </SectionErrorBoundary>

          {/* NEGOTIATION APPROACH */}
          <SectionErrorBoundary fallbackTitle="Negotiation Approach">
          {result.negotiationApproach && (
          <div id="negotiation-approach" className="bg-white rounded-xl shadow-md p-4 sm:p-6 print-section scroll-mt-24">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Recommended Negotiation Approach</h2>
            {naStrategy && <p className="text-sm text-gray-700 mb-4">{naStrategy}</p>}
            {naOpening && (
              <div className="bg-[#fdf8ed] border border-[#c9a84c]/30 rounded-lg p-4 mb-4">
                <p className="text-sm font-semibold text-[#0f1e3d] mb-1">Opening Move</p>
                <p className="text-sm text-gray-700">{naOpening}</p>
              </div>
            )}
            {naPrinciples.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">Key Principles</p>
                <ul className="space-y-1">
                  {naPrinciples.map((p: any, i: number) => (
                    <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                      <span className="text-[#c9a84c]">-</span> {typeof p === "object" ? JSON.stringify(p) : p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {naSteps.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">Step-by-Step Tactics</p>
                <div className="space-y-2">
                  {naSteps.map((step: any, i: number) => (
                    <div key={i} className="flex gap-3 bg-gray-50 rounded-lg p-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#0f1e3d] text-white text-xs font-bold flex items-center justify-center">
                        {typeof step === "object" ? (step?.step ?? i + 1) : i + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {typeof step === "string" ? step : (step?.action ?? step?.description ?? step?.tactic ?? JSON.stringify(step))}
                        </p>
                        {typeof step === "object" && (step?.timing || step?.rationale) && (
                          <p className="text-xs text-gray-500">{step?.timing ?? ""}{step?.rationale ? ` — ${step.rationale}` : ""}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {naWalkAway && (
              <div className="bg-red-50 border border-red-100 rounded-lg p-3 mb-4">
                <p className="text-sm text-red-700"><strong>Walk-Away Threshold:</strong> {naWalkAway}</p>
              </div>
            )}
            {naPrioritizedAsks.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Prioritized Ask List</p>
                <ul className="space-y-1">
                  {naPrioritizedAsks.map((ask: any, i: number) => (
                    <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                      <span className="text-[#c9a84c] font-bold">{i + 1}.</span> {typeof ask === "object" ? (ask?.ask ?? ask?.item ?? ask?.description ?? JSON.stringify(ask)) : ask}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          )}
          </SectionErrorBoundary>

          {/* UPSELL: Hospitalist Shift Economics — if billing provisions flagged */}
          {(result.billingProvisions || result.clauseAnalysis?.some((c: any) =>
            /billing|coding|rvu|collections|revenue/i.test(c?.clauseName ?? c?.name ?? "")
          )) && (
          <div className="no-print bg-white border border-[#1a6b6b] rounded-xl p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#1a6b6b] mb-1">Know what you're actually billing</p>
                <h3 className="font-bold text-[#1a2744] text-base">Hospitalist Shift Economics</h3>
                <p className="text-sm text-gray-600 mt-1">Decode hospitalist shift economics — shift rate vs. encounters, admit fees, nocturnist differential, and observation billing — before you sign.</p>
              </div>
              <a href="https://buy.stripe.com/eVqdRb694cAM7gN9St3ZK05" target="_blank" rel="noopener noreferrer"
                className="flex-shrink-0 self-start sm:self-center bg-[#1a6b6b] hover:bg-[#155858] text-white font-bold px-5 py-2.5 rounded-lg text-sm transition-colors whitespace-nowrap">
                Get it — $47
              </a>
            </div>
          </div>
          )}

          {/* NEGOTIATION PRIORITIES */}
          <SectionErrorBoundary fallbackTitle="Negotiation Priorities">
          {priorities.length > 0 && (
          <div id="negotiation-priorities" className="bg-white rounded-xl shadow-md p-4 sm:p-6 print-section scroll-mt-24">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Negotiation Priorities</h2>
            <div className="space-y-4">
              {priorities.map((p: any, i: number) => {
                const pName = p?.clause ?? p?.clauseName ?? p?.name ?? p?.issue ?? "Item";
                const pRationale = p?.rationale ?? p?.reason ?? p?.description ?? p?.financialImpact ?? "";
                const pCurrent = p?.currentLanguage ?? p?.current_language ?? p?.currentTerms ?? p?.current_terms ?? "";
                const pTarget = p?.suggestedLanguage ?? p?.suggested_language ?? p?.recommendedLanguage ?? p?.targetTerms ?? p?.target_terms ?? "";
                const pWalkAway = p?.walkAwayPoint ?? p?.walk_away_point ?? p?.walkAway ?? "";
                return (
                <div key={i} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-800">#{p?.priority ?? i + 1}: {pName}</h3>
                  </div>
                  {pRationale && <p className="text-sm text-gray-600 mb-3">{pRationale}</p>}
                  {pCurrent && (
                    <div className="bg-red-50 rounded-lg p-3 mb-2">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-red-600 font-medium">Current Terms</p>
                      </div>
                      <p className="text-sm text-gray-700 italic">{pCurrent}</p>
                    </div>
                  )}
                  {pTarget && (
                    <div className="bg-green-50 rounded-lg p-3 mb-2">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-green-600 font-medium">Target Terms</p>
                        <CopyButton text={pTarget} id={`target-${i}`} label="Copy" copiedId={copiedId} copy={copy} />
                      </div>
                      <p className="text-sm text-gray-700 italic">{pTarget}</p>
                    </div>
                  )}
                  {pWalkAway && (
                    <div className="bg-yellow-50 rounded-lg p-3">
                      <p className="text-xs text-yellow-700 font-medium mb-1">Walk-Away Point</p>
                      <p className="text-sm text-gray-700">{pWalkAway}</p>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>
          )}
          </SectionErrorBoundary>

          {/* UPSELL: Negotiation Script Pack — shown when priorities exist */}
          {priorities.length > 0 && (
          <div className="no-print bg-[#1a2744] rounded-xl p-4 sm:p-5 text-white">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#c9a84c] mb-1">Take these priorities to the table</p>
                <h3 className="font-bold text-white text-base">IM & Hospitalist Negotiation Script Pack</h3>
                <p className="text-sm text-gray-300 mt-1">Word-for-word scripts for every scenario your analysis flagged — compensation, non-compete, tail coverage, and more. Tested by internal medicine and hospitalist physicians.</p>
              </div>
              <a href="https://buy.stripe.com/28E14pdBw8kw7gN0hT3ZK07" target="_blank" rel="noopener noreferrer"
                className="flex-shrink-0 self-start sm:self-center bg-[#c9a84c] hover:bg-[#b8973b] text-[#0f1e3d] font-bold px-5 py-2.5 rounded-lg text-sm transition-colors whitespace-nowrap">
                Get it — $197
              </a>
            </div>
          </div>
          )}

          {/* COUNTER-PROPOSAL LETTER GENERATOR */}
          <SectionErrorBoundary fallbackTitle="Counter-Proposal">
          <div id="counter-proposal" className="bg-white rounded-xl shadow-md p-4 sm:p-6 print-section scroll-mt-24">
            <div className="flex items-center gap-3 mb-2">
              <FileText className="h-5 w-5 text-[#c9a84c]" />
              <h2 className="text-lg font-bold text-gray-800">Generate Counter-Proposal Letter</h2>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Create a professional communication template based on your analysis. Choose your situation, tone, and which priorities to include.
            </p>

            {!counterLetter && (
              <>
                {/* Purpose selector */}
                <div className="mb-4">
                  <p className="text-xs text-gray-500 font-medium mb-2">What is this for?</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setCounterPurpose("new_contract")}
                      className={`flex-1 py-3 px-3 rounded-lg text-sm font-medium border transition-colors text-left ${
                        counterPurpose === "new_contract" ? "bg-[#0f1e3d] text-white border-[#0f1e3d]" : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      <span className="block font-semibold">New Contract</span>
                      <span className={`block text-xs mt-0.5 ${counterPurpose === "new_contract" ? "text-gray-300" : "text-gray-400"}`}>Responding to an offer before signing</span>
                    </button>
                    <button
                      onClick={() => setCounterPurpose("renegotiation")}
                      className={`flex-1 py-3 px-3 rounded-lg text-sm font-medium border transition-colors text-left ${
                        counterPurpose === "renegotiation" ? "bg-[#0f1e3d] text-white border-[#0f1e3d]" : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      <span className="block font-semibold">Renegotiation</span>
                      <span className={`block text-xs mt-0.5 ${counterPurpose === "renegotiation" ? "text-gray-300" : "text-gray-400"}`}>Requesting changes to an existing contract</span>
                    </button>
                  </div>
                </div>

                {/* Tone selector */}
                <div className="mb-4">
                  <p className="text-xs text-gray-500 font-medium mb-2">Tone</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setCounterTone("collaborative")}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                        counterTone === "collaborative" ? "bg-[#0f1e3d] text-white border-[#0f1e3d]" : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      Collaborative
                    </button>
                    <button
                      onClick={() => setCounterTone("firm")}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                        counterTone === "firm" ? "bg-[#0f1e3d] text-white border-[#0f1e3d]" : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      Firm
                    </button>
                  </div>
                </div>

                {/* Renegotiation: Contract start date */}
                {counterPurpose === "renegotiation" && (
                  <div className="mb-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <p className="text-xs text-gray-500 font-medium mb-2">Contract Start Date</p>
                    {!startDateConfirmed && !startDateSkipped ? (
                      <div>
                        <p className="text-xs text-gray-500 mb-2">
                          {contractStartDate
                            ? "We found this start date in your contract. Please confirm or correct it."
                            : "Enter the date your current contract began (used to calculate tenure and identify expired provisions)."}
                        </p>
                        <input
                          type="date"
                          value={contractStartDate}
                          onChange={(e) => setContractStartDate(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-[#c9a84c]"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => setStartDateConfirmed(true)}
                            disabled={!contractStartDate}
                            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-[#0f1e3d] text-white hover:bg-[#1a2d5a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            Confirm Date
                          </button>
                          <button
                            onClick={() => { setStartDateSkipped(true); setContractStartDate(""); }}
                            className="px-4 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-300 hover:border-gray-400 transition-colors"
                          >
                            Skip — I don't know
                          </button>
                        </div>
                      </div>
                    ) : startDateConfirmed ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-sm text-gray-700">Contract started: <strong>{contractStartDate}</strong></span>
                        <button
                          onClick={() => { setStartDateConfirmed(false); }}
                          className="text-xs text-gray-400 hover:text-gray-600 ml-2"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500 italic">Start date skipped — tenure won't be referenced in the letter.</span>
                        <button
                          onClick={() => { setStartDateSkipped(false); }}
                          className="text-xs text-gray-400 hover:text-gray-600 ml-2"
                        >
                          Add Date
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Priority checkboxes — split into Active/Expired for renegotiation */}
                {priorities.length > 0 && (
                  <div className="mb-4">
                    {(() => {
                      const hasOneTimeData = priorities.some((p: any) => typeof p?.isOneTime === "boolean");
                      const isReneg = counterPurpose === "renegotiation" && hasOneTimeData;

                      const activePriorities = isReneg
                        ? priorities.map((p: any, i: number) => ({ ...p, _idx: i })).filter((p: any) => !p.isOneTime)
                        : priorities.map((p: any, i: number) => ({ ...p, _idx: i }));
                      const expiredPriorities = isReneg
                        ? priorities.map((p: any, i: number) => ({ ...p, _idx: i })).filter((p: any) => p.isOneTime)
                        : [];

                      return (
                        <>
                          {/* Active / Ongoing Terms */}
                          <p className="text-xs text-gray-500 font-medium mb-2">
                            {isReneg ? "Active / Ongoing Terms" : "Include these priorities:"}
                          </p>
                          <div className="space-y-2 mb-3">
                            {activePriorities.map((p: any) => {
                              const pName = p?.clause ?? p?.clauseName ?? p?.name ?? p?.issue ?? `Priority ${p._idx + 1}`;
                              return (
                                <label key={p._idx} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={selectedPriorities.has(p._idx)}
                                    onChange={() => {
                                      const next = new Set(selectedPriorities);
                                      if (next.has(p._idx)) next.delete(p._idx); else next.add(p._idx);
                                      setSelectedPriorities(next);
                                    }}
                                    className="rounded border-gray-300 text-[#0f1e3d] focus:ring-[#0f1e3d]"
                                  />
                                  #{p._idx + 1}: {pName}
                                </label>
                              );
                            })}
                          </div>

                          {/* Expired / Fulfilled Provisions */}
                          {expiredPriorities.length > 0 && (
                            <div className="mt-4 border-t border-gray-200 pt-3">
                              <p className="text-xs text-gray-500 font-medium mb-1">Fulfilled / Expired Provisions</p>
                              <p className="text-[11px] text-gray-400 mb-3">
                                These items have already been fulfilled or expired. They won't be included in your letter unless you check them below.
                              </p>
                              <div className="space-y-3">
                                {expiredPriorities.map((p: any) => {
                                  const pName = p?.clause ?? p?.clauseName ?? p?.name ?? p?.issue ?? `Priority ${p._idx + 1}`;
                                  const basis = p?.expirationBasis || "This provision has been fulfilled or expired.";
                                  return (
                                    <div key={p._idx} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                                      <label className="flex items-start gap-2 text-sm text-gray-600 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={expiredIncluded.has(p._idx)}
                                          onChange={() => {
                                            const next = new Set(expiredIncluded);
                                            if (next.has(p._idx)) next.delete(p._idx); else next.add(p._idx);
                                            setExpiredIncluded(next);
                                          }}
                                          className="rounded border-gray-300 text-gray-400 focus:ring-gray-400 mt-0.5"
                                        />
                                        <div>
                                          <span className="font-medium text-gray-500">{pName}</span>
                                          <span className="ml-2 inline-block text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">Expired</span>
                                          <p className="text-xs text-gray-400 mt-1">{basis}</p>
                                        </div>
                                      </label>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}

                <button
                  onClick={generateCounterProposal}
                  disabled={counterLoading || (selectedPriorities.size === 0 && expiredIncluded.size === 0)}
                  className="w-full bg-[#c9a84c] text-[#0f1e3d] font-semibold py-3 rounded-lg hover:bg-[#d4b85c] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {counterLoading ? (
                    <>
                      <div className="h-4 w-4 rounded-full border-2 border-[#0f1e3d] border-t-transparent animate-spin" />
                      Generating letter...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4" /> Generate Counter-Proposal Letter
                    </>
                  )}
                </button>
                {counterError && (
                  <div role="alert" className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                    <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{counterError}</p>
                  </div>
                )}
              </>
            )}

            {counterLetter && (
              <div>
                <div className="flex items-center justify-between mb-3 no-print">
                  <div className="flex gap-2 flex-wrap">
                    <CopyButton text={counterLetter} id="counter-letter" label="Copy Letter" copiedId={copiedId} copy={copy} />
                    {/* FIX 3: Download button for the counter-proposal .docx */}
                    <a
                      href={`/api/analyze/${id}/letter.docx`}
                      download={`Counter-Proposal-Letter-${id}.docx`}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-[#0f1e3d] bg-[#c9a84c]/20 hover:bg-[#c9a84c]/40"
                    >
                      Download .docx
                    </a>
                    <button
                      onClick={() => { setCounterLetter(null); }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-gray-500 hover:text-gray-700"
                    >
                      Regenerate
                    </button>
                    {email && (
                      letterEmailSent ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-green-600">
                          ✓ Sent to {email}
                        </span>
                      ) : (
                        <button
                          onClick={sendLetterEmail}
                          disabled={letterEmailSending}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-[#0f1e3d] bg-[#c9a84c]/20 hover:bg-[#c9a84c]/40 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {letterEmailSending ? "Sending…" : "Send to my email"}
                        </button>
                      )
                    )}
                  </div>
                </div>
                <div className="letter-content bg-gray-50 border border-gray-200 rounded-lg p-6 text-sm text-gray-800 whitespace-pre-wrap">
                  {counterLetter}
                </div>
                <p className="text-[10px] text-gray-400 mt-3 italic">
                  This is a communication template for informational purposes only. It does not constitute legal advice and should not be relied upon as a substitute for consultation with a qualified attorney. Review all proposed terms with legal counsel before sending. No attorney-client relationship is created by use of this tool.
                </p>
              </div>
            )}
          </div>
          </SectionErrorBoundary>

          {/* CONTRACT Q&A CHAT */}
          <div id="contract-chat" className="bg-white rounded-xl shadow-md p-4 sm:p-6 no-print scroll-mt-24">
            <button
              onClick={() => { setChatOpen(!chatOpen); if (!chatOpen) setTimeout(() => chatInputRef.current?.focus(), 100); }}
              className="w-full flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <MessageCircle className="h-5 w-5 text-[#2ec4b6]" />
                <div className="text-left">
                  <h2 className="text-lg font-bold text-gray-800">Ask a Question About Your Contract</h2>
                  <p className="text-sm text-gray-500">Get instant answers about specific clauses, terms, or concerns</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">{chatQuestionsRemaining} questions remaining</span>
                <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${chatOpen ? "rotate-180" : ""}`} />
              </div>
            </button>

            {chatOpen && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                {/* Chat messages */}
                <div className="space-y-3 max-h-96 overflow-y-auto mb-4 scroll-smooth">
                  {chatMessages.length === 0 && (
                    <div className="text-center py-6">
                      <Bot className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                      <p className="text-sm text-gray-500 mb-3">Ask anything about your contract — compensation terms, non-compete clauses, malpractice coverage, or what specific language means.</p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {[
                          "What does the RVU formula mean for my pay?",
                          "Is the non-compete enforceable?",
                          "Who pays for tail coverage?",
                          "What are the biggest risks?",
                        ].map((q) => (
                          <button
                            key={q}
                            onClick={() => { setChatInput(q); chatInputRef.current?.focus(); }}
                            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-full transition-colors"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-lg px-4 py-3 text-sm ${
                        msg.role === "user"
                          ? "bg-[#0f1e3d] text-white"
                          : "bg-gray-100 text-gray-800"
                      }`}>
                        {msg.role === "assistant" ? (
                          <div className="whitespace-pre-wrap">
                            {msg.content.split("\n").map((line, li) => {
                              if (line.startsWith("*") && line.endsWith("*") && line.includes("not legal advice")) {
                                return <p key={li} className="text-[10px] text-gray-400 italic mt-2 pt-2 border-t border-gray-200">{line.replace(/^\*|\*$/g, "")}</p>;
                              }
                              if (line === "---") return null;
                              return <span key={li}>{line}{"\n"}</span>;
                            })}
                          </div>
                        ) : msg.content}
                      </div>
                    </div>
                  ))}

                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 rounded-lg px-4 py-3">
                        <div className="flex gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                          <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                          <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>

                {/* Chat input */}
                {chatQuestionsRemaining > 0 ? (
                  <div className="flex gap-2">
                    <textarea
                      ref={chatInputRef}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendChatMessage();
                        }
                      }}
                      placeholder="Ask about your contract..."
                      rows={1}
                      className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-base sm:text-sm focus:border-[#2ec4b6] focus:ring-1 focus:ring-[#2ec4b6] outline-none resize-none"
                    />
                    <button
                      onClick={sendChatMessage}
                      disabled={chatLoading || !chatInput.trim()}
                      className="bg-[#2ec4b6] text-white px-4 py-2.5 rounded-lg hover:bg-[#28b0a3] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <p className="text-sm text-gray-500">You've used all 15 questions for this analysis.</p>
                    <p className="text-xs text-gray-400 mt-1">For additional questions, consult a healthcare attorney.</p>
                  </div>
                )}

                <p className="text-[10px] text-gray-400 mt-2 text-center">
                  This is educational analysis, not legal advice. Consult a healthcare attorney before making contract decisions.
                </p>

                {chatMessages.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <button
                      onClick={downloadPDF}
                      className="w-full flex items-center justify-center gap-2 bg-[#0f1e3d] text-white text-sm font-semibold py-2.5 px-4 rounded-lg hover:bg-[#1a2d5a] transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      Download Complete Report (with Q&amp;A)
                    </button>
                    {/* FIX 2: dedicated Q&A download + email so the transcript
                        can be saved separately from the full report PDF. */}
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <a
                        href={`/api/analyze/${id}/qa.txt`}
                        download={`MedContract-QA-${id}.txt`}
                        className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded text-xs font-medium text-[#0f1e3d] bg-gray-100 hover:bg-gray-200"
                      >
                        Download Q&amp;A (.txt)
                      </a>
                      {email ? (
                        qaEmailSent ? (
                          <span className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded text-xs font-medium text-green-700 bg-green-50">
                            ✓ Q&amp;A emailed to {email}
                          </span>
                        ) : (
                          <button
                            onClick={sendQaEmail}
                            disabled={qaEmailSending}
                            className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded text-xs font-medium text-[#0f1e3d] bg-[#c9a84c]/20 hover:bg-[#c9a84c]/40 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {qaEmailSending ? "Sending Q&A…" : "Email Q&A Transcript"}
                          </button>
                        )
                      ) : (
                        <button
                          onClick={() => setShowEmailModal(true)}
                          className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded text-xs font-medium text-[#0f1e3d] bg-[#c9a84c]/20 hover:bg-[#c9a84c]/40"
                        >
                          Add email to send Q&amp;A
                        </button>
                      )}
                    </div>
                    {qaEmailError && (
                      <p className="text-[11px] text-red-600 mt-1.5">{qaEmailError}</p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1.5 text-center">Your Q&amp;A transcript is saved and appended to the PDF</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* WHAT TO DO NEXT */}
          <div className="bg-gradient-to-r from-[#0f1e3d] to-[#1a2d5a] rounded-xl p-6 text-white print-section">
            <h2 className="text-lg font-bold mb-4">What To Do Next</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#c9a84c] text-[#0f1e3d] text-sm font-bold flex items-center justify-center">1</div>
                <div>
                  <p className="font-semibold text-sm">Download your report</p>
                  <p className="text-xs text-gray-300 mt-0.5">Save the PDF for your records and share with a trusted colleague.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#c9a84c] text-[#0f1e3d] text-sm font-bold flex items-center justify-center">2</div>
                <div>
                  <p className="font-semibold text-sm">Generate your counter-proposal</p>
                  <p className="text-xs text-gray-300 mt-0.5">Use the letter generator above to draft your response.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#c9a84c] text-[#0f1e3d] text-sm font-bold flex items-center justify-center">3</div>
                <div>
                  <p className="font-semibold text-sm">Consult an attorney if needed</p>
                  <p className="text-xs text-gray-300 mt-0.5">For high-risk contracts, have a healthcare attorney review before signing.</p>
                </div>
              </div>
            </div>
          </div>

          {/* ATTORNEY REFERRAL */}
          <div className="bg-white rounded-xl shadow-md p-4 sm:p-6 border-t-4 border-[#0f1e3d] print-section">
            <h2 className="text-lg font-bold text-gray-800 mb-3">When to Consult an Attorney</h2>
            <p className="text-sm text-gray-600 mb-4">
              This tool identifies financial and structural risks. It does not provide legal advice and cannot replace an attorney for high-stakes negotiations.
            </p>
            <p className="text-sm font-medium text-gray-700 mb-2">Consider consulting a healthcare attorney if your report shows:</p>
            <ul className="space-y-1 mb-4">
              <li className="text-sm text-gray-600 flex items-start gap-2"><span className="text-red-500 mt-0.5">-</span> A <strong>Critical</strong> or <strong>High</strong> overall risk rating</li>
              <li className="text-sm text-gray-600 flex items-start gap-2"><span className="text-red-500 mt-0.5">-</span> A non-compete clause rated <strong>Red severity</strong></li>
              <li className="text-sm text-gray-600 flex items-start gap-2"><span className="text-red-500 mt-0.5">-</span> Any termination provision with less than 60 days notice without cause</li>
              <li className="text-sm text-gray-600 flex items-start gap-2"><span className="text-red-500 mt-0.5">-</span> Tail insurance responsibility estimated above $15,000</li>
            </ul>
            <p className="text-sm font-medium text-gray-700 mb-2">To find a healthcare attorney in your state:</p>
            <ul className="space-y-1 mb-4">
              <li>
                <a href="https://www.americanbar.org/groups/health_law/" target="_blank" rel="noopener noreferrer" className="text-sm text-[#0f1e3d] hover:underline flex items-center gap-2">
                  <ExternalLink className="h-3 w-3 flex-shrink-0" /> State Bar Physician Health Law Directory (ABA)
                </a>
              </li>
              <li>
                <a href="https://www.healthlawyers.org/Pages/Find-a-Health-Lawyer.aspx" target="_blank" rel="noopener noreferrer" className="text-sm text-[#0f1e3d] hover:underline flex items-center gap-2">
                  <ExternalLink className="h-3 w-3 flex-shrink-0" /> American Health Lawyers Association Member Directory
                </a>
              </li>
              <li className="text-sm text-gray-600 flex items-center gap-2">
                <ExternalLink className="h-3 w-3 flex-shrink-0" /> Ask your state medical society — most maintain a referral list
              </li>
            </ul>
          </div>

          {/* UPSELL: PDF Bundle — always shown at bottom of every report */}
          <div className="no-print bg-gradient-to-br from-[#1a2744] via-[#1a3a5c] to-[#1a2744] rounded-xl p-5 sm:p-6 text-white border border-[#c9a84c]/30">
            <div className="text-center mb-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#c9a84c] mb-1">Complete your negotiation toolkit</p>
              <h3 className="font-bold text-white text-lg">Get All 3 PDFs — $247 <span className="text-[#c9a84c] line-through text-sm font-normal ml-1">$311</span></h3>
              <p className="text-sm text-gray-300 mt-1">Hospitalist Shift Economics + IM wRVU Playbook + Negotiation Script Pack. Save $64.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <a href="https://buy.stripe.com/6oU28tbtofMY8kR1lX3ZK08" target="_blank" rel="noopener noreferrer"
                className="bg-[#c9a84c] hover:bg-[#b8973b] text-[#0f1e3d] font-bold px-6 py-3 rounded-lg text-sm transition-colors text-center">
                Get the Bundle — $247
              </a>
            </div>
            <p className="text-center text-xs text-gray-400 mt-3">Instant PDF delivery · One-time payment · No subscription</p>
          </div>

          {/* DISCLAIMER */}
          <SectionErrorBoundary fallbackTitle="Disclaimer">
          <div className="bg-gray-100 rounded-xl p-6 print-section">
            <h2 className="text-sm font-bold text-gray-600 mb-2">Disclaimer</h2>
            <p className="text-[10px] text-gray-500 leading-relaxed">
              {typeof result.disclaimer === "string"
                ? result.disclaimer
                : result.disclaimer?.text || "This analysis is provided for informational and educational purposes only and does not constitute legal, financial, or professional advice. The information contained in this report should not be relied upon as a substitute for consultation with a qualified attorney, financial advisor, or other professional. No attorney-client relationship is created by use of this tool. Compensation benchmarks are based on publicly available survey data and may not reflect your specific market. Contract analysis is generated by automated systems and may contain errors or omissions. Always verify critical contract terms independently and consult with appropriate professionals before making employment decisions."}
            </p>
            {typeof result.disclaimer === "object" && result.disclaimer?.applicableJurisdiction && (
              <p className="text-[10px] text-gray-400 mt-1">Jurisdiction: {result.disclaimer.applicableJurisdiction}</p>
            )}
          </div>
          </SectionErrorBoundary>

          <div className="text-center pb-8">
            <p className="text-xs text-gray-400">MedContractIntel™ — Contract Analysis</p>
          </div>
        </div>
      </div>
    </div>
  );
}
