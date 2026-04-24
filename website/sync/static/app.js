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
  const transcript      = elements.transcriptInput.value;
  const sentenceCount   = (transcript.match(/[.!?]+/g) || []).length || 1;

  elements.statsContainer.innerHTML = `
    <div class="stat-item">
      <div class="stat-number">${sentenceCount}</div>
      <div class="stat-label">Sentences</div>
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
