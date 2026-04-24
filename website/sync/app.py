from flask import Flask, request, jsonify, render_template
import requests
import json
import os
import re

# ─── PDF Support ────────────────────────────────────────────────────────────
MAX_PDF_BYTES = 10 * 1024 * 1024   # 10 MB upload limit
ALLOWED_EXT   = {"pdf"}            # whitelist

try:
    import pdfplumber
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False

app = Flask(__name__)

def analyze(text, topic):

    prompt = f"""
    You are an AI meeting assistant.

    The meeting topic is:
    "{topic}"

    Analyze the meeting transcript and compare it with the topic.

    Extract:
    1. Toxicity (mention sentences if any)
    2. Action items (task, assignee, deadline)
    3. Topic deviation:
       - Is meeting aligned with topic?
       - Mention off-topic sentences if any
    4. Key highlights
    5. Summary

    Return ONLY valid JSON:
    {{
      "toxicity": [],
      "action_items": [],
      "topic_deviation": {{
          "status": "",
          "off_topic_points": []
      }},
      "key_highlights": [],
      "summary": ""
    }}

    Meeting:
    {text}
    """

    response = requests.post(
        "http://localhost:11434/api/generate",
        json={
            "model": "qwen2.5",
            "prompt": prompt,
            "stream": False
        }
    )

    return response.json()["response"]

@app.route("/", methods=["GET"])
def home():
    return render_template("index.html")

@app.route("/analyze", methods=["POST"])
def analyze_api():
    data = request.json
    text = data["text"]
    topic = data["topic"]

    result = analyze(text, topic)

    # 🔥 CLEAN THE RESPONSE
    cleaned = result.replace("```json", "").replace("```", "").strip()

    try:
        parsed = json.loads(cleaned)
        return jsonify(parsed)
    except:
        return jsonify({"raw": cleaned})


# ─── NEW: PDF Upload Route ──────────────────────────────────────────────────
@app.route("/upload", methods=["POST"])
def upload_pdf():
    """
    Accepts PDF file + meeting topic via multipart/form-data.
    Extracts text, then calls shared analyze() function.
    """
    
    # Guard: PDF library available
    if not PDF_SUPPORT:
        return jsonify({"error": "PDF support not installed. Run: pip install pdfplumber"}), 500
    
    # Guard: file present
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded. Please attach a PDF."}), 400
    
    file = request.files["file"]
    topic = request.form.get("topic", "").strip()
    
    if not topic:
        return jsonify({"error": "Meeting topic is required."}), 400
    
    # Guard: correct extension
    filename = file.filename or ""
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension not in ALLOWED_EXT:
        return jsonify({"error": f"Invalid file type '.{extension}'. Only PDF files are accepted."}), 400
    
    # Guard: file size
    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)  # rewind before reading
    if size > MAX_PDF_BYTES:
        mb = MAX_PDF_BYTES // (1024 * 1024)
        return jsonify({"error": f"File too large ({size // (1024*1024)} MB). Maximum allowed: {mb} MB."}), 413
    
    # Extract text
    try:
        extracted_pages = []
        with pdfplumber.open(file) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    extracted_pages.append(page_text.strip())
        
        full_text = "\n\n".join(extracted_pages).strip()
    
    except Exception as e:
        return jsonify({"error": f"Could not read PDF: {str(e)}"}), 422
    
    # Guard: non-empty extraction
    if not full_text:
        return jsonify({
            "error": "No readable text found in this PDF. It may be a scanned image or contain only graphics."
        }), 422
    
    # ─── TEXT CLEANING FOR LLM QUALITY ──────────────────────────────────
    # Cleaning PDF text improves LLM understanding and avoids wasting context on whitespace.
    # This removes noise, normalizes spacing, and merges broken sentences.
    cleaned_text = full_text
    
    # Remove multiple consecutive newlines (keep paragraphs but reduce noise)
    cleaned_text = re.sub(r'\n+', '\n', cleaned_text)
    
    # Remove multiple spaces and tabs (normalize spacing)
    cleaned_text = re.sub(r'[ \t]+', ' ', cleaned_text)
    
    # Fix broken lines: merge lines that are part of the same sentence
    # This handles PDFs where text is split across lines mid-sentence
    cleaned_text = re.sub(r'(?<!\n)\n(?!\n)', ' ', cleaned_text)
    
    # Final strip to remove leading/trailing whitespace
    cleaned_text = cleaned_text.strip()
    # ─────────────────────────────────────────────────────────────────────
    
    # ─── TEXT LIMITING FOR LLM PERFORMANCE ───────────────────────────────
    # Local LLMs have context size limits, so we truncate input for reliability and speed.
    # This prevents timeouts and memory issues with large PDFs (20+ pages).
    MAX_ANALYSIS_CHARS = 8000
    analysis_text = cleaned_text[:MAX_ANALYSIS_CHARS]
    
    # Try to cut at sentence boundary (last period) to avoid breaking mid-sentence
    last_period = analysis_text.rfind(".")
    if last_period != -1:
        analysis_text = analysis_text[:last_period + 1]
    # ─────────────────────────────────────────────────────────────────────
    
    # Analyze (reuse shared function)
    try:
        raw_result = analyze(analysis_text, topic)
    except Exception as e:
        return jsonify({"error": f"Analysis failed: {str(e)}"}), 500
    
    cleaned = raw_result.replace("```json", "").replace("```", "").strip()
    
    try:
        parsed = json.loads(cleaned)
        # Attach extraction metadata so frontend can show preview
        parsed["_pdf_meta"] = {
            "filename": filename,
            "pages": len(extracted_pages),
            "char_count_original": len(full_text),
            "char_count_cleaned": len(cleaned_text),
            "preview": cleaned_text[:400] + ("…" if len(cleaned_text) > 400 else ""),
        }
        return jsonify(parsed)
    except:
        return jsonify({"raw": cleaned})


if __name__ == "__main__":
    app.run(debug=True)