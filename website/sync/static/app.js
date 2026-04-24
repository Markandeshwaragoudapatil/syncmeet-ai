/* ============================================
   SyncMeet AI - Application Logic
   ============================================ */

const elements = {
  topicInput:      document.getElementById("topic"),
  transcriptInput: document.getElementById("inputText"),
  analyzeBtn:      document.querySelector(".btn-analyze"),
  resultsContainer: document.getElementById("results"),
  statsContainer:  document.getElementById("stats"),
  charCounter:     document.getElementById("charCounter"),
};

// ============================================
// WORD COUNTER (new in redesign)
// ============================================
elements.transcriptInput.addEventListener("input", updateWordCount);

function updateWordCount() {
  const words = elements.transcriptInput.value.trim().split(/\s+/).filter(Boolean).length;
  if (elements.charCounter) {
    elements.charCounter.textContent = words === 0 ? "0 words" : `${words.toLocaleString()} word${words !== 1 ? "s" : ""}`;
  }
}

// ============================================
// EVENT LISTENERS
// ============================================
elements.analyzeBtn.addEventListener("click", handleAnalyze);

elements.topicInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") elements.transcriptInput.focus();
});

// ============================================
// MAIN ANALYZE FUNCTION
// ============================================
async function handleAnalyze() {
  const topic      = elements.topicInput.value.trim();
  const transcript = elements.transcriptInput.value.trim();

  if (!topic)      { showError("Please enter a meeting topic."); return; }
  if (!transcript) { showError("Please paste the meeting transcript."); return; }

  setButtonLoading(true);

  try {
    const response = await fetch("/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, text: transcript }),
    });

    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);

    const data = await response.json();
    currentInputMode = "text";  // Track that this is text mode
    renderResults(data);
    elements.resultsContainer.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    console.error("Analysis error:", error);
    showError("Failed to analyze transcript. Please try again.");
  } finally {
    setButtonLoading(false);
  }
}

// ============================================
// BUTTON LOADING STATE
// Matches new HTML structure: .btn-text + .btn-icon
// ============================================
function setButtonLoading(isLoading) {
  const btn = elements.analyzeBtn;
  if (isLoading) {
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-spinner" style="display:inline-block;"></span> Analyzing…`;
  } else {
    btn.disabled = false;
    btn.innerHTML = `
      <span class="btn-text">Analyze Meeting</span>
      <span class="btn-icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </span>
    `;
  }
}

// ============================================
// STATE TRACKING
// ============================================
let currentInputMode = "text"; // "text" or "pdf"
let currentPdfPageCount = 0;   // Store PDF page count for stats

// ============================================
// RENDER ORCHESTRATOR
// ============================================
function renderResults(data) {
  renderStats(data);

  elements.resultsContainer.innerHTML = `
    <div class="results-section">
      <div class="results-grid">
        ${renderToxicityCard(data.toxicity)}
        ${renderTopicDeviationCard(data.topic_deviation)}
        ${renderActionItemsCard(data.action_items)}
        ${renderHighlightsCard(data.key_highlights)}
        ${renderSummaryCard(data.summary)}
      </div>
    </div>
  `;

  applyOverflowCheck();
}

// ============================================
// STATS
// ============================================
function renderStats(data) {
  const toxicityCount   = data.toxicity ? data.toxicity.length : 0;
  const actionCount     = data.action_items ? data.action_items.length : 0;
  const deviationCount  = data.topic_deviation?.off_topic_points?.length ?? 0;
  
  // Determine if using PDF or text input
  let firstStatNumber;
  let firstStatLabel;
  
  if (currentInputMode === "pdf") {
    // For PDF: show page count
    firstStatNumber = currentPdfPageCount;
    firstStatLabel = "Pages";
  } else {
    // For text: show sentence count
    const transcript = elements.transcriptInput.value;
    firstStatNumber = (transcript.match(/[.!?]+/g) || []).length || 1;
    firstStatLabel = "Sentences";
  }

  elements.statsContainer.innerHTML = `
    <div class="stat-item">
      <div class="stat-number">${firstStatNumber}</div>
      <div class="stat-label">${firstStatLabel}</div>
    </div>
    <div class="stat-item">
      <div class="stat-number">${deviationCount}</div>
      <div class="stat-label">Deviations</div>
    </div>
    <div class="stat-item">
      <div class="stat-number" style="color:${toxicityCount > 0 ? 'var(--danger)' : 'var(--success)'}">
        ${toxicityCount}
      </div>
      <div class="stat-label">Toxic Flags</div>
    </div>
    <div class="stat-item">
      <div class="stat-number">${actionCount}</div>
      <div class="stat-label">Action Items</div>
    </div>
  `;
}

// ============================================
// CARD RENDERERS
// ============================================

function renderToxicityCard(toxicity) {
  const count = toxicity?.length ?? 0;
  const inner = count === 0
    ? `<div class="empty-state"><span class="empty-state-icon">✨</span><p>No toxicity detected. Great meeting!</p></div>`
    : `<div class="scrollable">${toxicity.map(i => `<div class="toxic-item">${escapeHtml(i)}</div>`).join("")}</div>`;

  return card("🔴", "Toxicity Detection", count > 0 ? `${count} found` : "", inner);
}

function renderTopicDeviationCard(deviation) {
  if (!deviation) return card("🎯", "Topic Alignment", "", `<div class="empty-state"><p>No alignment data</p></div>`);

  const isAligned = deviation.status?.toLowerCase() === "aligned";
  const points    = deviation.off_topic_points ?? [];
  const count     = points.length;

  const statusHtml = `<p><strong style="color:var(--text-2);font-size:0.82rem;">Status:</strong>
    <span class="status-badge ${isAligned ? "status-aligned" : "status-deviated"}">${deviation.status}</span></p>`;

  const pointsHtml = count === 0
    ? `<p style="margin-top:.875rem;color:var(--success);font-size:.875rem;">✓ Discussion stayed on track</p>`
    : `<p style="margin-top:.875rem;margin-bottom:.5rem;font-size:.82rem;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:.06em;">Off-Topic Points</p>
       <div class="scrollable">${points.map(p => `<div class="toxic-item">${escapeHtml(p)}</div>`).join("")}</div>`;

  return card("🎯", "Topic Alignment", count > 0 ? `${count} off-topic` : "", statusHtml + pointsHtml);
}

function renderActionItemsCard(actionItems) {
  const count = actionItems?.length ?? 0;
  const inner = count === 0
    ? `<div class="empty-state"><p>No action items identified</p></div>`
    : `<div class="scrollable">${actionItems.map(item => `
        <div class="action-item">
          <div class="action-item-field">
            <span class="action-item-label">Task</span>
            <span class="action-item-value">${escapeHtml(item.task || "—")}</span>
          </div>
          <div class="action-item-field">
            <span class="action-item-label">Assignee</span>
            <span class="action-item-value">${escapeHtml(item.assignee || "—")}</span>
          </div>
          <div class="action-item-field">
            <span class="action-item-label">Deadline</span>
            <span class="action-item-value">${escapeHtml(item.deadline || "—")}</span>
          </div>
        </div>`).join("")}</div>`;

  return card("📋", "Action Items", count > 0 ? `${count} tasks` : "", inner);
}

function renderHighlightsCard(highlights) {
  const count = highlights?.length ?? 0;
  const inner = count === 0
    ? `<div class="empty-state"><p>No highlights identified</p></div>`
    : `<div class="scrollable">${highlights.map(h => `<div class="highlight-item">${escapeHtml(h)}</div>`).join("")}</div>`;

  return card("⭐", "Key Highlights", count > 0 ? `${count} points` : "", inner);
}

function renderSummaryCard(summary) {
  return card("📄", "Meeting Summary", "", `<p>${escapeHtml(summary || "No summary available.")}</p>`);
}

// ============================================
// CARD BUILDER — shared template
// ============================================
function card(icon, title, countLabel, body) {
  return `
    <div class="card">
      <div class="card-header">
        <span class="card-icon">${icon}</span>
        <h3>${title}</h3>
        ${countLabel ? `<span class="card-count">${countLabel}</span>` : ""}
      </div>
      ${body}
    </div>
  `;
}

// ============================================
// OVERFLOW CHECK — removes fade on short lists
// ============================================
function applyOverflowCheck() {
  document.querySelectorAll(".scrollable").forEach((el) => {
    if (el.scrollHeight <= el.clientHeight) el.classList.add("no-overflow");
  });
}

// ============================================
// UTILITIES
// ============================================
function escapeHtml(text) {
  if (typeof text !== "string") return String(text ?? "");
  return text.replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
}

function showError(message) {
  elements.resultsContainer.innerHTML = `
    <div class="card" style="border-left:3px solid var(--danger);background:rgba(248,113,113,0.05);">
      <div class="card-header">
        <span class="card-icon">⚠️</span>
        <h3 style="color:var(--danger);">Error</h3>
      </div>
      <p style="color:#fca5a5;font-size:.9rem;">${escapeHtml(message)}</p>
    </div>
  `;
  elements.resultsContainer.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ============================================
// 🆕 PDF UPLOAD FEATURE
// ============================================

// DOM references for PDF upload
const pdfUploadSection = document.getElementById("pdfUploadSection");
const pdfDropzone = document.getElementById("pdfDropzone");
const pdfFileInput = document.getElementById("pdfFileInput");
const pdfFileInfo = document.getElementById("pdfFileInfo");
const pdfFileName = document.getElementById("pdfFileName");
const pdfFileSize = document.getElementById("pdfFileSize");
const textModeBtn = document.getElementById("textModeBtn");
const pdfModeBtn = document.getElementById("pdfModeBtn");
const inputTextarea = document.getElementById("inputText");

let selectedPdfFile = null;

// ── Input mode toggle (Text vs PDF) ──────────────────────────────────────
textModeBtn.addEventListener("click", () => switchMode("text"));
pdfModeBtn.addEventListener("click", () => switchMode("pdf"));

function switchMode(mode) {
  const isText = mode === "text";
  
  inputTextarea.style.display = isText ? "block" : "none";
  pdfUploadSection.style.display = isText ? "none" : "block";
  
  textModeBtn.classList.toggle("active", isText);
  pdfModeBtn.classList.toggle("active", !isText);
  textModeBtn.setAttribute("aria-pressed", isText);
  pdfModeBtn.setAttribute("aria-pressed", !isText);
  
  // Clear the other input when switching
  if (isText) {
    selectedPdfFile = null;
  } else {
    elements.transcriptInput.value = "";
    updateWordCount();
  }
}

// ── PDF Dropzone interactions ────────────────────────────────────────────
pdfDropzone.addEventListener("click", () => pdfFileInput.click());

// Drag & drop support
pdfDropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  pdfDropzone.style.borderColor = "var(--primary)";
  pdfDropzone.style.backgroundColor = "rgba(59, 130, 246, 0.05)";
});

["dragleave", "dragend"].forEach(event => {
  pdfDropzone.addEventListener(event, () => {
    pdfDropzone.style.borderColor = "";
    pdfDropzone.style.backgroundColor = "";
  });
});

pdfDropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  pdfDropzone.style.borderColor = "";
  pdfDropzone.style.backgroundColor = "";
  const file = e.dataTransfer.files[0];
  if (file) handlePdfSelected(file);
});

pdfFileInput.addEventListener("change", () => {
  if (pdfFileInput.files[0]) handlePdfSelected(pdfFileInput.files[0]);
});

// ── File selection & validation ──────────────────────────────────────────
const MAX_PDF_MB = 10;

function handlePdfSelected(file) {
  // Validate file type
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    showError("❌ Invalid file type. Please upload a PDF file.");
    return;
  }
  
  // Validate file size
  if (file.size > MAX_PDF_MB * 1024 * 1024) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    showError(`❌ File too large (${sizeMB} MB). Maximum: ${MAX_PDF_MB} MB.`);
    return;
  }
  
  // Store file and show info
  selectedPdfFile = file;
  pdfFileName.textContent = file.name;
  pdfFileSize.textContent = ` (${formatFileSize(file.size)})`;
  pdfFileInfo.style.display = "block";
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Intercept analyze button for PDF mode ────────────────────────────────
// Override button click to detect which mode we're in
const originalAnalyzeBtn = elements.analyzeBtn;
originalAnalyzeBtn.removeEventListener("click", handleAnalyze);

originalAnalyzeBtn.addEventListener("click", () => {
  if (pdfUploadSection.style.display !== "none") {
    // PDF mode
    handlePdfAnalyze();
  } else {
    // Text mode
    handleAnalyze();
  }
});

// ── PDF analyze handler ──────────────────────────────────────────────────
async function handlePdfAnalyze() {
  const topic = elements.topicInput.value.trim();
  
  if (!topic) {
    showError("⚠️ Please enter a meeting topic before uploading.");
    return;
  }
  
  if (!selectedPdfFile) {
    showError("⚠️ Please select a PDF file to upload.");
    return;
  }
  
  setButtonLoading(true, "Extracting & Analyzing…");
  
  try {
    const formData = new FormData();
    formData.append("file", selectedPdfFile);
    formData.append("topic", topic);
    
    const response = await fetch("/upload", {
      method: "POST",
      body: formData,
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      showError(`❌ ${data.error || "Upload failed. Please try again."}`);
      return;
    }
    
    // Show file info in results if metadata provided
    if (data._pdf_meta) {
      const meta = data._pdf_meta;
      console.log(`✓ Extracted ${meta.pages} page(s), ${meta.char_count_cleaned} characters from ${meta.filename}`);
      currentPdfPageCount = meta.pages;  // Store page count for stats
    }
    
    currentInputMode = "pdf";  // Track that this is PDF mode
    
    // Reuse existing result renderer
    renderResults(data);
    elements.resultsContainer.scrollIntoView({ behavior: "smooth", block: "start" });
    
  } catch (error) {
    console.error("PDF upload error:", error);
    showError("❌ Upload failed. Please check your connection and try again.");
  } finally {
    setButtonLoading(false);
  }
}

// ── Helper: Update button loading state ──────────────────────────────────
function setButtonLoading(isLoading, label = "Analyzing…") {
  if (isLoading) {
    elements.analyzeBtn.disabled = true;
    elements.analyzeBtn.innerHTML = `<span class="btn-spinner" style="display:inline-block;"></span> ${label}`;
  } else {
    elements.analyzeBtn.disabled = false;
    elements.analyzeBtn.innerHTML = `
      <span class="btn-text">Analyze Meeting</span>
      <span class="btn-icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </span>
    `;
  }
}
