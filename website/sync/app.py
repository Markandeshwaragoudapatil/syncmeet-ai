from flask import Flask, request, jsonify, render_template
import requests
import json

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

if __name__ == "__main__":
    app.run(debug=True)