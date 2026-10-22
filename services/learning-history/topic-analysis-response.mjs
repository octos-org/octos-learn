// Model responses may wrap otherwise valid JSON in a single Markdown block.
// Normalize only that whole-response wrapper; all source/evidence validation
// still runs on the parsed object. Never extract objects from surrounding prose.
export function parseTopicAnalysisResponse(content) {
  const text = content.trim();
  const block = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(text);
  return JSON.parse(block ? block[1] : text);
}
