import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const inputMdPath = path.join(rootDir, 'docs', 'PRODUCT_OUTLINE_AND_ROADMAP.md');
const outputPdfPath = path.join(rootDir, 'docs', 'Octos_Learn_产品纲要与未来规划.pdf');
const markedJsPath = path.join(rootDir, 'scratch', 'marked.min.js');
const mermaidJsPath = path.join(rootDir, 'scratch', 'mermaid.min.js');

const markdownContent = fs.readFileSync(inputMdPath, 'utf-8');

async function exportPdf() {
  console.log('Launching headless browser...');
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true
  });

  const page = await browser.newPage();

  // Basic HTML skeleton
  await page.setContent(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Octos Learn 产品纲要与未来规划</title>
  <style>
    @page {
      size: A4;
      margin: 18mm 16mm 20mm 16mm;
    }
    
    * {
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "WenQuanYi Micro Hei", sans-serif;
      font-size: 13px;
      line-height: 1.65;
      color: #24292f;
      background-color: #ffffff;
      margin: 0;
      padding: 0;
    }

    .container {
      max-width: 100%;
      margin: 0 auto;
    }

    h1 {
      font-size: 23px;
      font-weight: 700;
      color: #0969da;
      border-bottom: 2px solid #eaecef;
      padding-bottom: 8px;
      margin-top: 0;
      margin-bottom: 14px;
    }

    h2 {
      font-size: 17px;
      font-weight: 600;
      color: #1f2328;
      border-bottom: 1px solid #d8dee4;
      padding-bottom: 6px;
      margin-top: 22px;
      margin-bottom: 12px;
      break-after: avoid;
      page-break-after: avoid;
    }

    h3 {
      font-size: 14.5px;
      font-weight: 600;
      color: #24292f;
      margin-top: 16px;
      margin-bottom: 8px;
      break-after: avoid;
      page-break-after: avoid;
    }

    h4 {
      font-size: 13.5px;
      font-weight: 600;
      color: #32383f;
      margin-top: 14px;
      margin-bottom: 6px;
      break-after: avoid;
      page-break-after: avoid;
    }

    p, ul, ol {
      margin-top: 0;
      margin-bottom: 10px;
    }

    ul, ol {
      padding-left: 20px;
    }

    li {
      margin-bottom: 4px;
    }

    blockquote {
      margin: 12px 0;
      padding: 8px 14px;
      color: #57606a;
      background-color: #f6f8fa;
      border-left: 4px solid #0969da;
      border-radius: 2px;
      font-size: 12.5px;
    }

    blockquote p:last-child {
      margin-bottom: 0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0;
      font-size: 12px;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    th, td {
      border: 1px solid #d0d7de;
      padding: 7px 10px;
      text-align: left;
    }

    th {
      background-color: #f6f8fa;
      font-weight: 600;
      color: #1f2328;
    }

    tr:nth-child(even) td {
      background-color: #fbfcfd;
    }

    code {
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      font-size: 11.5px;
      background-color: #eff1f3;
      padding: 1.5px 4.5px;
      border-radius: 3px;
      color: #cf222e;
    }

    pre {
      background-color: #f6f8fa;
      border: 1px solid #e1e4e8;
      border-radius: 6px;
      padding: 10px 12px;
      overflow-x: auto;
      break-inside: avoid;
      page-break-inside: avoid;
      margin: 10px 0;
    }

    pre code {
      background-color: transparent;
      padding: 0;
      color: #24292f;
      font-size: 11.5px;
    }

    hr {
      border: 0;
      height: 1px;
      background: #d8dee4;
      margin: 18px 0;
    }

    .mermaid-box {
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 16px 0;
      padding: 12px;
      background: #fafbfc;
      border: 1px solid #e1e4e8;
      border-radius: 6px;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .mermaid-box svg {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 0 auto;
    }
  </style>
</head>
<body>
  <div class="container" id="content"></div>
</body>
</html>`);

  console.log('Injecting Marked and Mermaid...');
  await page.addScriptTag({ path: markedJsPath });
  await page.addScriptTag({ path: mermaidJsPath });

  console.log('Parsing Markdown and rendering Mermaid diagrams...');
  await page.evaluate(async (md) => {
    // Configure marked
    marked.use({
      renderer: {
        code(token) {
          const lang = typeof token === 'object' ? token.lang : arguments[1];
          const text = typeof token === 'object' ? token.text : token;
          if (lang === 'mermaid') {
            return `<div class="mermaid-box" data-code="${encodeURIComponent(text)}"></div>`;
          }
          return `<pre><code>${text}</code></pre>`;
        }
      }
    });

    document.getElementById('content').innerHTML = marked.parse(md);

    // Initialize mermaid
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: 'basis'
      }
    });

    // Render all mermaid boxes
    const boxes = document.querySelectorAll('.mermaid-box');
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      const code = decodeURIComponent(box.getAttribute('data-code'));
      try {
        const id = `mermaid-render-${i}`;
        const { svg } = await mermaid.render(id, code);
        box.innerHTML = svg;
      } catch (err) {
        console.error('Mermaid render error for index', i, err);
        box.innerHTML = `<pre><code>${code}</code></pre>`;
      }
    }
  }, markdownContent);

  // Short pause for font layout & SVG bounds
  await page.waitForTimeout(800);

  console.log('Printing to PDF...');
  await page.pdf({
    path: outputPdfPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '18mm',
      bottom: '20mm',
      left: '16mm',
      right: '16mm'
    },
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="font-size: 8px; color: #8c959f; width: 100%; padding: 0 16mm; display: flex; justify-content: space-between; font-family: -apple-system, sans-serif;">
        <span>Octos Learn（小章鱼学习）产品纲要与未来规划</span>
        <span>2026-09-22</span>
      </div>
    `,
    footerTemplate: `
      <div style="font-size: 8px; color: #8c959f; width: 100%; padding: 0 16mm; display: flex; justify-content: space-between; font-family: -apple-system, sans-serif;">
        <span>内部讨论参考 · Confidential</span>
        <span>第 <span class="pageNumber"></span> 页 / 共 <span class="totalPages"></span> 页</span>
      </div>
    `
  });

  await browser.close();

  console.log(`PDF successfully created at:\n- ${outputPdfPath}`);
}

exportPdf().catch((err) => {
  console.error('Failed to export PDF:', err);
  process.exit(1);
});
