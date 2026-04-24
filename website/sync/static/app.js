/* ============================================
   SyncMeet AI - Application Logic
   Handles API communication and UI rendering
   ============================================ */

// Cache DOM elements for better performance
const elements = {
  topicInput: document.getElementById("topic"),
  transcriptInput: document.getElementById("inputText"),
  analyzeBtn: document.querySelector(".btn-analyze"),
  resultsContainer: document.getElementById("results"),
  statsContainer: document.getElementById("stats"),
};

// ============================================
// EVENT LISTENERS
// ============================================

// Analyze button click handler
elements.analyzeBtn.addEventListener("click", handleAnalyze);

// Allow Enter key in topic input to focus transcript
elements.topicInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    elements.transcriptInput.focus();
  }
});

// ============================================
// MAIN ANALYZE FUNCTION
// ============================================

/**
 * Handles the analysis process
 * 1. Validates input
 * 2. Shows loading state
 * 3. Calls backend API
 * 4. Renders results
 */
async function handleAnalyze() {
  const topic = elements.topicInput.value.trim();
  const transcript = elements.transcriptInput.value.trim();

  // Validation
  if (!topic) {
    showError("Please enter a meeting topic");
    return;
  }

  if (!transcript) {
    showError("Please paste the meeting transcript");
    return;
  }

  // Disable button and show loading state
  elements.analyzeBtn.disabled = true;
  elements.analyzeBtn.textContent = "Analyzing";

  try {
    // Call backend API
    const response = await fetch("/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: topic,
        text: transcript,
      }),
    });

    // Handle API errors
    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }

    const data = await response.json();

    // Render results
    renderResults(data);

    // Scroll to results
    elements.resultsContainer.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    console.error("Analysis error:", error);
    showError("Failed to analyze transcript. Please try again.");
  } finally {
    // Reset button state
    elements.analyzeBtn.disabled = false;
    elements.analyzeBtn.textContent = "Analyze";
  }
}

// ============================================
// RENDER FUNCTIONS
// ============================================

/**
 * Renders statistics grid
 * @param {Object} data - API response data
 */
function renderStats(data) {
  let html = '';

  // Count toxicity items
  const toxicityCount = data.toxicity ? data.toxicity.length : 0;

  // Count action items
  const actionItemsCount = data.action_items ? data.action_items.length : 0;

  // Count off-topic points
  const deviationsCount =
    data.topic_deviation && data.topic_deviation.off_topic_points
      ? data.topic_deviation.off_topic_points.length
      : 0;

  // Estimate sentences (get from transcript in window scope or count periods)
  const transcriptText = elements.transcriptInput.value;
  const sentenceCount = (transcriptText.match(/[.!?]+/g) || []).length || 1;

  html = `
    <div class="stat-item">
      <div class="stat-number">${sentenceCount}</div>
      <div class="stat-label">Sentences</div>
    </div>
    <div class="stat-item">
      <div class="stat-number">${deviationsCount}</div>
      <div class="stat-label">Deviations</div>
    </div>
    <div class="stat-item">
      <div class="stat-number" style="color: ${toxicityCount > 0 ? '#ef4444' : '#10b981'};">${toxicityCount}</div>
      <div class="stat-label">Toxic Flags</div>
    </div>
    <div class="stat-item">
      <div class="stat-number">${actionItemsCount}</div>
      <div class="stat-label">Action Items</div>
    </div>
  `;

  elements.statsContainer.innerHTML = html;
}

/**
 * Main render function that orchestrates all cards
 * @param {Object} data - API response data
 */
function renderResults(data) {
  // Render stats
  renderStats(data);

  let html = `<div class="results-section"><div class="results-grid">`;

  // Render each card
  html += renderToxicityCard(data.toxicity);
  html += renderTopicDeviationCard(data.topic_deviation);
  html += renderActionItemsCard(data.action_items);
  html += renderHighlightsCard(data.key_highlights);
  html += renderSummaryCard(data.summary);

  html += `</div></div>`;

  elements.resultsContainer.innerHTML = html;
}

/**
 * Renders Toxicity Detection Card
 * Shows unprofessional or toxic sentences detected in the meeting
 */
function renderToxicityCard(toxicity) {
  let html = `
    <div class="card">
      <div class="card-header">
        <span class="card-icon">🔴</span>
        <h3>Toxicity Detection</h3>
      </div>
  `;

  if (!toxicity || toxicity.length === 0) {
    html += `
      <div class="empty-state">
        <div class="empty-state-icon">✨</div>
        <p>No toxicity detected. Great meeting!</p>
      </div>
    `;
  } else {
    toxicity.forEach((item) => {
      html += `<div class="toxic-item">${escapeHtml(item)}</div>`;
    });
  }

  html += `</div>`;
  return html;
}

/**
 * Renders Topic Deviation Card
 * Shows whether discussion stayed on topic
 */
function renderTopicDeviationCard(deviation) {
  const isAligned = deviation.status.toLowerCase() === "aligned";
  const statusClass = isAligned ? "status-aligned" : "status-deviated";

  let html = `
    <div class="card">
      <div class="card-header">
        <span class="card-icon">🎯</span>
        <h3>Topic Alignment</h3>
      </div>
      <p>
        <strong>Status:</strong>
        <span class="status-badge ${statusClass}">${deviation.status}</span>
      </p>
  `;

  if (
    deviation.off_topic_points &&
    Array.isArray(deviation.off_topic_points) &&
    deviation.off_topic_points.length > 0
  ) {
    html += `<p style="margin-top: 1rem;"><strong>Off-Topic Points:</strong></p>`;
    deviation.off_topic_points.forEach((point) => {
      html += `<div class="toxic-item">${escapeHtml(point)}</div>`;
    });
  } else {
    html += `<p style="margin-top: 1rem; color: var(--success-color);">✓ Discussion stayed on track</p>`;
  }

  html += `</div>`;
  return html;
}

/**
 * Renders Action Items Card
 * Displays tasks, assignees, and deadlines
 */
function renderActionItemsCard(actionItems) {
  let html = `
    <div class="card">
      <div class="card-header">
        <span class="card-icon">📋</span>
        <h3>Action Items</h3>
      </div>
  `;

  if (!actionItems || actionItems.length === 0) {
    html += `
      <div class="empty-state">
        <p>No action items identified</p>
      </div>
    `;
  } else {
    actionItems.forEach((item) => {
      html += `
        <div class="action-item">
          <div class="action-item-field">
            <span class="action-item-label">Task:</span>
            <span class="action-item-value">${escapeHtml(item.task)}</span>
          </div>
          <div class="action-item-field">
            <span class="action-item-label">Assignee:</span>
            <span class="action-item-value">${escapeHtml(item.assignee)}</span>
          </div>
          <div class="action-item-field">
            <span class="action-item-label">Deadline:</span>
            <span class="action-item-value">${escapeHtml(item.deadline)}</span>
          </div>
        </div>
      `;
    });
  }

  html += `</div>`;
  return html;
}

/**
 * Renders Key Highlights Card
 * Shows important insights and decisions from the meeting
 */
function renderHighlightsCard(highlights) {
  let html = `
    <div class="card">
      <div class="card-header">
        <span class="card-icon">⭐</span>
        <h3>Key Highlights</h3>
      </div>
  `;

  if (!highlights || highlights.length === 0) {
    html += `
      <div class="empty-state">
        <p>No highlights identified</p>
      </div>
    `;
  } else {
    highlights.forEach((highlight) => {
      html += `<div class="highlight-item">${escapeHtml(highlight)}</div>`;
    });
  }

  html += `</div>`;
  return html;
}

/**
 * Renders Summary Card
 * Displays overall meeting summary
 */
function renderSummaryCard(summary) {
  let html = `
    <div class="card">
      <div class="card-header">
        <span class="card-icon">📄</span>
        <h3>Meeting Summary</h3>
      </div>
      <p>${escapeHtml(summary)}</p>
    </div>
  `;
  return html;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text safe for HTML
 */
function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Shows an error message to the user
 * @param {string} message - Error message to display
 */
function showError(message) {
  // Clear previous results
  elements.resultsContainer.innerHTML = `
    <div class="card" style="border-left: 4px solid var(--danger-color); background: #fef2f2;">
      <div class="card-header">
        <span class="card-icon">⚠️</span>
        <h3>Error</h3>
      </div>
      <p style="color: var(--danger-color);">${escapeHtml(message)}</p>
    </div>
  `;

  // Scroll to error
  elements.resultsContainer.scrollIntoView({ behavior: "smooth", block: "start" });
}
