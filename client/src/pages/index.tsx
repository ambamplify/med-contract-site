import React, { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileText, AlertCircle, ChevronDown } from "lucide-react";

const STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
  "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
  "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
  "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire",
  "New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio",
  "Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota",
  "Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia",
  "Wisconsin","Wyoming",
];

// Full state name → Census region (auto-populated on state select, stays editable)
const STATE_TO_REGION: Record<string, string> = {
  "Connecticut":"New England","Massachusetts":"New England","Maine":"New England",
  "New Hampshire":"New England","Rhode Island":"New England","Vermont":"New England",
  "New Jersey":"Middle Atlantic","New York":"Middle Atlantic","Pennsylvania":"Middle Atlantic",
  "Illinois":"East North Central","Indiana":"East North Central","Michigan":"East North Central",
  "Ohio":"East North Central","Wisconsin":"East North Central",
  "Iowa":"West North Central","Kansas":"West North Central","Minnesota":"West North Central",
  "Missouri":"West North Central","North Dakota":"West North Central","Nebraska":"West North Central",
  "South Dakota":"West North Central",
  "Delaware":"South Atlantic","Florida":"South Atlantic","Georgia":"South Atlantic",
  "Maryland":"South Atlantic","North Carolina":"South Atlantic","South Carolina":"South Atlantic",
  "Virginia":"South Atlantic","West Virginia":"South Atlantic",
  "Alabama":"East South Central","Kentucky":"East South Central","Mississippi":"East South Central",
  "Tennessee":"East South Central",
  "Arkansas":"West South Central","Louisiana":"West South Central","Oklahoma":"West South Central",
  "Texas":"West South Central",
  "Arizona":"Mountain","Colorado":"Mountain","Idaho":"Mountain","Montana":"Mountain",
  "New Mexico":"Mountain","Nevada":"Mountain","Utah":"Mountain","Wyoming":"Mountain",
  "Alaska":"Pacific","California":"Pacific","Hawaii":"Pacific","Oregon":"Pacific","Washington":"Pacific",
};

const REGIONS = [
  "New England","Middle Atlantic","East North Central","West North Central",
  "South Atlantic","East South Central","West South Central","Mountain","Pacific","Other",
];

const COMP_MODELS = [
  "Hourly Rate","RVU-Based","Collections-Based","Salary (Fixed)","Hybrid (Base + Productivity)","Other / Unknown",
];

const EXPERIENCE = [
  "PGY-4 / New Grad","1-3 years","4-7 years","8-15 years","15+ years",
];

const SETTINGS = [
  "Outpatient / Primary Care Clinic","Inpatient / Hospitalist Service","Academic Medical Center","Community Hospital","Rural / Critical Access","Concierge / DPC","Teaching Service","Federal / VA","Other",
];

const SPECIALTIES = [
  "Internal Medicine (Outpatient)","Internal Medicine (Primary Care)","Hospitalist","Nocturnist","Academic IM","IM Subspecialty (please specify in notes)","Other",
];

const APC_SUPERVISION = [
  "Yes — I regularly supervise APCs (PAs/NPs)",
  "Sometimes — APCs are present but I don't always supervise",
  "No — I work independently without APCs",
  "Not sure / Don't know yet",
];

const EMPLOYERS = [
  "Hospital System","Hospital Medicine Group","Large CMG (TeamHealth/Sound/etc.)","Private IM Group","Concierge / DPC","Academic","Federal / VA","Locum","Other / Unknown",
];

// Hoisted out of IntakePage so it doesn't remount on every render
// (which was killing focus on the underlying <select> elements).
const SelectField = ({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder: string;
}) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2.5 pr-10 text-base sm:text-sm focus:border-[#0a2d20] focus:ring-1 focus:ring-[#0a2d20] outline-none"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-gray-400 pointer-events-none" />
    </div>
  </div>
);

const BrandMark = ({ size = 56 }: { size?: number }) => (
  <img src="/images/brand-icon.png" width={size} height={size} alt="Internal Medicine & Hospitalist Contract Intel" style={{ borderRadius: '6px' }} />
);

export default function IntakePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [contractText, setContractText] = useState("");
  const [fileName, setFileName] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [inputMode, setInputMode] = useState<"none" | "file" | "text">("none");
  const [state, setState] = useState("");
  const [region, setRegion] = useState("");
  const [compensationModel, setCompensationModel] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [settingType, setSettingType] = useState("");
  const [employerType, setEmployerType] = useState("");
  const [apcSupervision, setApcSupervision] = useState("");
  const [phone, setPhone] = useState("");
  const [bundleEmail, setBundleEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  // Prevent browser from opening dropped files anywhere on the page
  useEffect(() => {
    const prevent = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    document.addEventListener("dragover", prevent);
    document.addEventListener("drop", prevent);
    return () => {
      document.removeEventListener("dragover", prevent);
      document.removeEventListener("drop", prevent);
    };
  }, []);

  const handleFile = useCallback((file: File) => {
    if (file.type === "application/pdf" || file.type === "text/plain" || file.name.endsWith(".txt") || file.name.endsWith(".pdf")) {
      setUploadedFile(file);
      setFileName(file.name);
      setInputMode("file");
      setContractText("");
      setError("");
    } else {
      setError("Please upload a PDF or text file.");
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // Auto-populate region from state selection (stays manually editable)
  const handleStateChange = useCallback((v: string) => {
    setState(v);
    const autoRegion = STATE_TO_REGION[v];
    if (autoRegion) setRegion(autoRegion);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (inputMode === "none" && !contractText.trim()) {
      setError("Please upload a contract file or paste contract text.");
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();

      if (inputMode === "file" && uploadedFile) {
        formData.append("contract", uploadedFile);
      } else if (contractText.trim()) {
        formData.append("contractText", contractText);
      } else {
        setError("Please provide contract text.");
        setSubmitting(false);
        return;
      }

      formData.append("state", state);
      formData.append("region", region);
      formData.append("compensationModel", compensationModel);
      formData.append("yearsExperience", yearsExperience);
      formData.append("settingType", settingType);
      formData.append("employerType", employerType);
      formData.append("apcSupervision", apcSupervision);
      if (phone.trim()) formData.append("phone", phone.trim());
      if (bundleEmail.trim()) formData.append("bundleEmail", bundleEmail.trim());

      // Payment gate (FIX 0): intake goes to /api/create-checkout which
      // either redeems a bundle analyzer credit (skipCheckout=true) or
      // returns a Stripe Checkout URL that redirects back to
      // /analyzer/report/:id after payment.
      const res = await fetch("/api/create-checkout", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to start checkout");
      }

      // Bundle credit redeemed — go straight to the report page.
      if (data.skipCheckout && data.redirect) {
        window.location.href = data.redirect;
        return;
      }

      if (!data.url) {
        throw new Error("Checkout URL missing in response");
      }

      // Hand off to Stripe. On successful payment Stripe returns to
      // /analyzer/report/{data.analysisId}.
      window.location.href = data.url;
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a2d20] to-[#0a2d20]">

      {/* Subtle back link */}
      <div className="px-4 pt-4 pb-1">
        <a href="https://medcontractintel.com" style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.8rem", textDecoration: "none" }}>← Internal Medicine & Hospitalist Contract Intel</a>
      </div>

      {/* Page content */}
      <div className="py-8 px-4 pb-16">
        <div className="max-w-2xl mx-auto">

          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <BrandMark size={80} />
            </div>
            <h1 className="text-3xl font-bold text-white mb-1">MedContractIntel<sup style={{ fontSize: "0.5em", verticalAlign: "super" }}>™</sup></h1>
            <p className="text-[11px] text-[#9c7e2e] font-semibold tracking-[0.25em] uppercase mb-3">DATA · LEVERAGE · FAIR PAY</p>
            <div className="w-16 h-0.5 bg-[#1db5b5] mx-auto mb-3 rounded-full" />
            <p className="text-gray-300 text-sm">
              Upload your internal medicine and hospitalist employment contract for a comprehensive contract analysis
            </p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-xl p-6 space-y-6 border border-[#1db5b5]/10">
            {/* Contract Upload */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">Contract Document</label>

              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? "border-[#9c7e2e] bg-yellow-50"
                    : fileName
                    ? "border-green-400 bg-green-50"
                    : "border-gray-300 hover:border-[#1db5b5] hover:bg-[#1db5b5]/5"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,application/pdf,text/plain"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {fileName ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="h-6 w-6 text-green-600" />
                    <span className="text-green-700 font-medium">{fileName}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFileName("");
                        setUploadedFile(null);
                        setInputMode("none");
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="ml-2 text-gray-400 hover:text-red-500 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-[#9c7e2e]/60 mx-auto mb-2" />
                    <p className="text-gray-600 font-medium">Drop your contract PDF here, or click to browse</p>
                    <p className="text-gray-400 text-sm mt-1">PDF or TXT files up to 10MB</p>
                  </>
                )}
              </div>

              {/* iPhone/Android upload guide */}
              <details className="mt-3 text-xs text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
                <summary className="px-4 py-2.5 cursor-pointer font-medium text-gray-600 select-none list-none flex items-center gap-2">
                  <span className="text-base">📱</span> How to upload from your phone
                </summary>
                <div className="px-4 pb-4 pt-1 space-y-2">
                  <div>
                    <p className="font-semibold text-gray-600 mb-1">iPhone</p>
                    <ol className="list-decimal list-inside space-y-1 text-gray-500">
                      <li>Open the email with your contract and save the PDF attachment to <strong>Files</strong></li>
                      <li>Tap the upload area above</li>
                      <li>Select <strong>Browse</strong> → find your PDF in Files</li>
                    </ol>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-600 mb-1">Android</p>
                    <ol className="list-decimal list-inside space-y-1 text-gray-500">
                      <li>Save the PDF to your <strong>Downloads</strong> folder</li>
                      <li>Tap the upload area above</li>
                      <li>Select the PDF from your file browser</li>
                    </ol>
                  </div>
                  <p className="text-gray-400 pt-1">Or paste contract text directly into the field below.</p>
                </div>
              </details>

              {/* OR divider */}
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent to-[#1db5b5]/30" />
                <span className="text-xs text-[#9c7e2e] font-medium tracking-wide uppercase">or paste contract text</span>
                <div className="flex-1 h-px bg-gradient-to-l from-transparent to-[#1db5b5]/30" />
              </div>

              {/* Text input */}
              <textarea
                value={contractText}
                onChange={(e) => {
                  setContractText(e.target.value);
                  if (e.target.value.trim()) {
                    setInputMode("text");
                    setFileName("");
                    setUploadedFile(null);
                  } else {
                    setInputMode(uploadedFile ? "file" : "none");
                  }
                }}
                placeholder="Paste your full contract text here..."
                rows={6}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base sm:text-sm focus:border-[#0a2d20] focus:ring-1 focus:ring-[#0a2d20] outline-none resize-y"
              />
            </div>

            {/* Context Fields */}
            <div className="border-t border-[#1db5b5]/20 pt-6">
              <h2 className="text-sm font-semibold text-gray-800 mb-4">Contract Context</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SelectField label="Who is this contract with?" value={employerType} onChange={setEmployerType} options={EMPLOYERS} placeholder="Select employer type..." />
                <SelectField label="State" value={state} onChange={handleStateChange} options={STATES} placeholder="Select state..." />
                <SelectField label="Region" value={region} onChange={setRegion} options={REGIONS} placeholder="Select region..." />
                <SelectField label="Compensation Model" value={compensationModel} onChange={setCompensationModel} options={COMP_MODELS} placeholder="Select model..." />
                <SelectField label="Years of Experience" value={yearsExperience} onChange={setYearsExperience} options={EXPERIENCE} placeholder="Select experience..." />
                <SelectField label="Practice Setting" value={settingType} onChange={setSettingType} options={SETTINGS} placeholder="Select setting..." />
                {/* APC full-width — spans both columns */}
                <div className="md:col-span-2">
                  <SelectField label="Do you supervise APCs (PAs/NPs)?" value={apcSupervision} onChange={setApcSupervision} options={APC_SUPERVISION} placeholder="Select APC status..." />
                </div>
              </div>
            </div>

            {/* Optional phone */}
            <div className="border-t border-[#1db5b5]/20 pt-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 555-5555"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-base sm:text-sm focus:border-[#0a2d20] focus:ring-1 focus:ring-[#0a2d20] outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">For SMS updates on your analysis. We never share your number.</p>
            </div>

            {/* FIX 4 (2026-04-15): Bundle redemption — now prominent. Gold-accent
                banner above submit so bundle buyers don't accidentally pay twice. */}
            <div className="rounded-xl p-5 border-2 border-[#9c7e2e]/70 bg-gradient-to-br from-[#fffaf0] to-[#fff5d9] shadow-sm">
              <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#9c7e2e] mb-1.5">
                Purchased the Complete Bundle?
              </p>
              <label className="block text-lg font-bold text-[#0a2d20] mb-1">
                Redeem your included analysis
              </label>
              <p className="text-sm text-gray-700 mb-3">
                Enter the email you used at checkout. If your email has an unused credit, we'll skip the $97 charge and start your analysis immediately.
              </p>
              <input
                type="email"
                value={bundleEmail}
                onChange={(e) => setBundleEmail(e.target.value)}
                placeholder="you@email.com"
                className="w-full rounded-lg border-2 border-[#9c7e2e]/40 bg-white px-4 py-3 text-base sm:text-sm font-medium focus:border-[#9c7e2e] focus:ring-2 focus:ring-[#9c7e2e]/30 outline-none"
              />
              <p className="text-xs text-gray-500 mt-2">
                Don't have a bundle? Leave this blank — you'll checkout at $97 below. If the email has no credit, we'll send you to checkout automatically.
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            {/* Submit — gold primary CTA */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#9c7e2e] text-[#0a2d20] font-bold py-3.5 rounded-lg hover:bg-[#9c7e2e] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
            >
              {submitting ? "Submitting..." : "Analyze Contract"}
            </button>

            {/* Payment handoff message */}
            <p className="text-xs text-gray-500 text-center -mt-3">
              You will be redirected to a secure checkout. Your analysis starts immediately after payment.
            </p>

            {/* Trust signals row */}
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-gray-500 -mt-2">
              <span className="inline-flex items-center gap-1">
                <svg className="h-3.5 w-3.5 text-[#1db5b5]" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4L8.5 12l6.8-6.7a1 1 0 0 1 1.4 0z" clipRule="evenodd"/></svg>
                Encrypted upload
              </span>
              <span className="inline-flex items-center gap-1">
                <svg className="h-3.5 w-3.5 text-[#1db5b5]" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4L8.5 12l6.8-6.7a1 1 0 0 1 1.4 0z" clipRule="evenodd"/></svg>
                Report in under 5 minutes
              </span>
              <span className="inline-flex items-center gap-1">
                <svg className="h-3.5 w-3.5 text-[#1db5b5]" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4L8.5 12l6.8-6.7a1 1 0 0 1 1.4 0z" clipRule="evenodd"/></svg>
                Refund if analysis fails
              </span>
            </div>

            <p className="text-xs text-gray-400 text-center">
              Your contract data is processed securely and not stored beyond the analysis session.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
