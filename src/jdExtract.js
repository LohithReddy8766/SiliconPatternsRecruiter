/**
 * Client-side job-description text extraction from uploaded files.
 * Loads pdf.js / mammoth from a CDN on demand so nothing is added to the
 * main bundle (they only download the first time someone uploads a file).
 */

const PDFJS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const MAMMOTH_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`);
    if (existing) {
      if (existing.getAttribute('data-loaded') === 'true') return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.setAttribute('data-src', src);
    s.onload = () => { s.setAttribute('data-loaded', 'true'); resolve(); };
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function extractPdf(file) {
  await loadScript(PDFJS_SRC);
  const pdfjsLib = window.pdfjsLib;
  if (!pdfjsLib) throw new Error('PDF reader failed to load. Check your connection and try again.');
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;

  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(' ') + '\n';
  }
  return text;
}

async function extractDocx(file) {
  await loadScript(MAMMOTH_SRC);
  if (!window.mammoth) throw new Error('DOCX reader failed to load. Check your connection and try again.');
  const arrayBuffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer });
  return result?.value || '';
}

/**
 * Extract plain text from an uploaded job-description file.
 * Supports PDF, DOCX and TXT. Legacy binary .doc is not supported.
 */
export async function extractJobDescriptionText(file) {
  const name = (file.name || '').toLowerCase();
  const ext = name.split('.').pop();
  const type = file.type || '';

  if (ext === 'pdf' || type === 'application/pdf') {
    return extractPdf(file);
  }
  if (ext === 'docx' || type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return extractDocx(file);
  }
  if (ext === 'txt' || type.startsWith('text/')) {
    return file.text();
  }
  if (ext === 'doc') {
    throw new Error('Old ".doc" files aren’t supported — save it as a PDF or .docx (or paste the text).');
  }
  // Last resort: try reading as plain text.
  return file.text();
}
