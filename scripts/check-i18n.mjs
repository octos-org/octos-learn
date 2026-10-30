// Check application-owned visible JSX labels; authored content, protocol
// prompts and imported course data are deliberately outside this boundary.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const en = JSON.parse(fs.readFileSync('src/i18n/messages/en.json', 'utf8'));
const zh = JSON.parse(fs.readFileSync('src/i18n/messages/zh.json', 'utf8'));
const failures = [];
const allowed = new Set(['Octos', 'Octos Learn', 'Octos Hub', 'API Key', 'ms', 'px', 'session_id:', 'smtp.example.com', 'Octos <login@example.com>', 'learner@example.com', 'you@example.com', 'TypeSafe Jev', 'https://api.example.com']);
let files = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!['i18n', 'test', 'fixtures'].includes(entry.name)) walk(file); continue; }
    if (!file.endsWith('.tsx') || /\.(test|spec)\./.test(file)) continue;
    files++;
    const source = fs.readFileSync(file, 'utf8');
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const check = (node, value) => {
      value = value.trim();
      if (!value || allowed.has(value) || !/[\p{L}]{2}/u.test(value)) return;
      const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
      failures.push(`${file}:${line}: ${value}`);
    };
    function visit(node) {
      if (ts.isCallExpression(node) && ['tr', 'translateStatus', 'localizedCatalog'].includes(node.expression.getText(tree))) return;
      if (ts.isJsxAttribute(node)) {
        if (!/^(alt|title|placeholder|aria-label|aria-description)$/.test(node.name.getText(tree))) return;
        if (node.initializer && ts.isStringLiteral(node.initializer)) check(node, node.initializer.text);
      } else if (ts.isJsxText(node)) check(node, node.text);
      else if (ts.isStringLiteral(node) && !ts.isJsxAttribute(node.parent)) {
        let parent = node.parent;
        while (parent && (ts.isConditionalExpression(parent) || ts.isBinaryExpression(parent) || ts.isParenthesizedExpression(parent))) {
          if (ts.isConditionalExpression(parent) && node.pos >= parent.condition.pos && node.end <= parent.condition.end) { parent = null; break; }
          if (ts.isBinaryExpression(parent) && ![ts.SyntaxKind.PlusToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(parent.operatorToken.kind)) { parent = null; break; }
          parent = parent.parent;
        }
        if (parent && ts.isJsxExpression(parent)) check(node, node.text);
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
}
walk('src');
if (JSON.stringify(Object.keys(en).sort()) !== JSON.stringify(Object.keys(zh).sort())) failures.push('Language resource keys differ');
for (const [key, value] of Object.entries(en)) if (/[\p{Script=Han}]/u.test(value)) failures.push(`English resource contains untranslated Chinese: ${key}`);
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`i18n check passed: ${files} UI files, ${Object.keys(en).length} matching message pairs.`);
