// src/utils/quotationPdf.js
const puppeteer = require('puppeteer');
const { quotationHtmlTemplate } = require('../services/quotation/quotation.pdf.template');

let browserPromise = null;

/**
 * Get or create a shared puppeteer browser instance.
 * Reusing the browser is much faster than launching a new one each time.
 */
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });
  }
  return browserPromise;
}

/**
 * Generate a PDF buffer from a quotation object.
 * @param {Object} quotation - The quotation client shape (from toClientShape)
 * @returns {Promise<Buffer>} PDF as a Buffer
 */
async function generateQuotationPdf(quotation) {
  const html = quotationHtmlTemplate({ quotation });
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
    });
    return pdfBuffer;
  } finally {
    await page.close();
  }
}

/**
 * Gracefully close the browser on shutdown.
 */
async function closePdfBrowser() {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}

module.exports = { generateQuotationPdf, closePdfBrowser };