// fileExtractor.js
// Extracts text from any supported file type for Sage document analysis

// Supported file types
export const SUPPORTED_TYPES = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'application/vnd.ms-excel': 'Excel',
  'text/plain': 'Text',
  'text/csv': 'CSV',
  'text/markdown': 'Markdown',
  'application/json': 'JSON',
  'text/javascript': 'JavaScript',
  'application/javascript': 'JavaScript',
  'text/x-java-source': 'Java',
  'text/x-python': 'Python',
  'text/x-c': 'C',
  'text/html': 'HTML',
  'text/css': 'CSS',
}

// File extensions we accept (for cases where MIME type is unreliable)
export const SUPPORTED_EXTENSIONS = [
  '.pdf', '.docx', '.xlsx', '.xls',
  '.txt', '.md', '.csv', '.json',
  '.js', '.jsx', '.ts', '.tsx',
  '.java', '.py', '.c', '.cpp',
  '.html', '.css', '.xml', '.yaml', '.yml'
]

// Max characters to send to API (Claude can handle ~15000 chars comfortably)
const MAX_CHARS = 12000

// ── Main extraction function ──────────────────────────────────────────────────
export const extractTextFromFile = async (file) => {
  const extension = '.' + file.name.split('.').pop().toLowerCase()

  // Check if supported
  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    throw new Error(`Unsupported file type: ${extension}. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`)
  }

  let text = ''

  try {
    if (extension === '.pdf') {
      text = await extractFromPDF(file)
    } else if (extension === '.docx') {
      text = await extractFromDocx(file)
    } else if (extension === '.xlsx' || extension === '.xls') {
      text = await extractFromExcel(file)
    } else {
      // All code files, text files, CSV, JSON etc - read as plain text
      text = await extractAsPlainText(file)
    }
  } catch (err) {
    throw new Error(`Could not read file: ${err.message}`)
  }

  // Clean up the text
  text = cleanText(text)

  if (!text || text.length < 50) {
    throw new Error('Could not extract enough text from this file. The file may be empty, image-only, or password protected.')
  }

  // Trim if too long, keeping the most important content
  if (text.length > MAX_CHARS) {
    text = text.substring(0, MAX_CHARS) + '\n\n[Document truncated at 12,000 characters for analysis]'
  }

  return text
}

// ── PDF Extraction ────────────────────────────────────────────────────────────
const extractFromPDF = async (file) => {
  const pdfjsLib = await import('pdfjs-dist')

  // Set worker - required by pdfjs
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  let fullText = ''
  const maxPages = Math.min(pdf.numPages, 30) // Cap at 30 pages

  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items.map(item => item.str).join(' ')
    fullText += `\n${pageText}`
  }

  if (pdf.numPages > 30) {
    fullText += `\n\n[Note: Document has ${pdf.numPages} pages. Only first 30 pages analyzed.]`
  }

  return fullText
}

// ── Word (.docx) Extraction ───────────────────────────────────────────────────
const extractFromDocx = async (file) => {
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value
}

// ── Excel Extraction ──────────────────────────────────────────────────────────
const extractFromExcel = async (file) => {
  const XLSX = await import('xlsx')
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })

  let fullText = ''

  // Process each sheet
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName]
    const csv = XLSX.utils.sheet_to_csv(sheet)
    if (csv.trim()) {
      fullText += `\n\nSheet: ${sheetName}\n${csv}`
    }
  })

  return fullText
}

// ── Plain Text Extraction (JS, Java, Python, TXT, CSV, JSON etc) ──────────────
const extractAsPlainText = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsText(file, 'UTF-8')
  })
}

// ── Text Cleaning ─────────────────────────────────────────────────────────────
const cleanText = (text) => {
  return text
    .replace(/\r\n/g, '\n')           // Normalize line endings
    .replace(/\r/g, '\n')             // Normalize line endings
    .replace(/\n{4,}/g, '\n\n\n')     // Remove excessive blank lines
    .replace(/[ \t]{3,}/g, '  ')      // Remove excessive spaces
    .trim()
}

// ── Format file size ──────────────────────────────────────────────────────────
export const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// ── Get file icon based on extension ─────────────────────────────────────────
export const getFileIcon = (filename) => {
  const ext = filename.split('.').pop().toLowerCase()
  const icons = {
    pdf: '📄', docx: '📝', doc: '📝',
    xlsx: '📊', xls: '📊', csv: '📊',
    js: '⚡', jsx: '⚡', ts: '⚡', tsx: '⚡',
    java: '☕', py: '🐍', c: '⚙️', cpp: '⚙️',
    json: '🔧', yaml: '🔧', yml: '🔧',
    html: '🌐', css: '🎨', md: '📋', txt: '📋',
  }
  return icons[ext] || '📄'
}
