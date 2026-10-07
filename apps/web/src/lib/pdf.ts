/** Elements marked with this attribute (buttons, chips) are left out of exported PDFs. */
export const PDF_IGNORE_ATTRIBUTE = 'data-pdf-ignore';
/** Scrollable areas marked with this attribute are fully expanded while exporting. */
export const PDF_EXPAND_ATTRIBUTE = 'data-pdf-expand';
/** Blocks (chapters, KPI grid, recommendations) that should not be split across pages. */
export const PDF_BLOCK_ATTRIBUTE = 'data-pdf-block';
const EXPORTING_ATTRIBUTE = 'data-pdf-exporting';

const PAGE_MARGIN_MM = 12;
const HEADER_MM = 14;
const FONT_SUBSETS = ['latin', 'latin-ext'];

let fontEmbedCss: Promise<string> | undefined;

async function toDataUrl(url: string) {
  const blob = await (await fetch(url)).blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler a fonte.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * The web fonts are served by Google Fonts (another origin), so their rules cannot be read from
 * the page. Fetch the stylesheet (CORS-enabled), keep the Latin subsets and inline the font files,
 * so the PDF uses the same faces and metrics as the screen.
 */
function getFontEmbedCss() {
  fontEmbedCss ??= (async () => {
    const links = [
      ...document.querySelectorAll<HTMLLinkElement>(
        'link[rel="stylesheet"][href*="fonts.googleapis.com"]',
      ),
    ];
    const sheets = await Promise.all(links.map(async (link) => (await fetch(link.href)).text()));
    // One block per @font-face, with the "/* subset */" comment Google adds for modern browsers.
    const blocks = sheets
      .join('\n')
      .split(/(?=(?:\/\*\s*[\w-]+\s*\*\/\s*)?@font-face)/)
      .filter((block) => block.includes('@font-face'))
      .filter((block) => {
        const subset = /^\s*\/\*\s*([\w-]+)\s*\*\//.exec(block)?.[1];
        return !subset || FONT_SUBSETS.includes(subset);
      });
    const inlined = await Promise.all(
      blocks.map(async (block) => {
        const url = /url\((https:[^)]+)\)/.exec(block)?.[1];
        return url ? block.replace(url, await toDataUrl(url)) : block;
      }),
    );
    return inlined.join('\n');
  })().catch(() => '');
  return fontEmbedCss;
}

function slugify(value: string) {
  return (
    value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 60) || 'analise'
  );
}

/**
 * Exports a rendered element (answer, study, charts and tables) to an A4 PDF download.
 * The element is rasterized as shown on screen and split across pages; the libraries are
 * loaded on demand so they do not weigh on the initial bundle.
 */
export async function exportElementToPdf(
  element: HTMLElement,
  options: { title: string; subtitle?: string },
) {
  const [{ toPng }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);

  // Expand scrollable charts/tables so nothing is cut, then wait for the layout to settle.
  element.setAttribute(EXPORTING_ATTRIBUTE, '');
  let image: string;
  // Bottom edges of the unbreakable blocks, in CSS px from the top of the element.
  let blockEnds: number[] = [];
  let elementHeight = 1;
  try {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const origin = element.getBoundingClientRect();
    elementHeight = Math.max(1, origin.height);
    blockEnds = [...element.querySelectorAll<HTMLElement>(`[${PDF_BLOCK_ATTRIBUTE}]`)]
      .map((block) => block.getBoundingClientRect().bottom - origin.top)
      .sort((left, right) => left - right);
    const fontCss = await getFontEmbedCss();
    image = await toPng(element, {
      backgroundColor: '#ffffff',
      pixelRatio: 2,
      ...(fontCss ? { fontEmbedCSS: fontCss } : { skipFonts: true }),
      filter: (node) => !(node instanceof HTMLElement && node.hasAttribute(PDF_IGNORE_ATTRIBUTE)),
    });
  } finally {
    element.removeAttribute(EXPORTING_ATTRIBUTE);
  }
  const { width, height } = await new Promise<{ width: number; height: number }>(
    (resolve, reject) => {
      const probe = new Image();
      probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
      probe.onerror = () => reject(new Error('Não foi possível gerar a imagem do relatório.'));
      probe.src = image;
    },
  );

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN_MM * 2;
  const contentHeight = pageHeight - PAGE_MARGIN_MM * 2 - HEADER_MM;
  const imageHeight = (height * contentWidth) / width;
  const mmPerPx = imageHeight / elementHeight;
  const breaks = blockEnds.map((end) => end * mmPerPx);

  // Page windows end at the last block boundary that fits; a block taller than a page is sliced.
  const windows: Array<{ start: number; end: number }> = [];
  for (let start = 0; start < imageHeight - 0.5;) {
    const limit = start + contentHeight;
    const boundary = breaks.filter((end) => end > start + 10 && end <= limit).at(-1);
    const end = limit >= imageHeight ? imageHeight : (boundary ?? limit);
    windows.push({ start, end });
    start = end;
  }
  const generatedAt = new Date().toLocaleString('pt-BR');
  const pages = windows.length;

  for (const [page, slice] of windows.entries()) {
    if (page > 0) pdf.addPage();
    const top = PAGE_MARGIN_MM + HEADER_MM;
    // Each page shows a window of the tall image; white bands hide what lies outside it.
    pdf.addImage(
      image,
      'PNG',
      PAGE_MARGIN_MM,
      top - slice.start,
      contentWidth,
      imageHeight,
      undefined,
      'FAST',
    );
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageWidth, top, 'F');
    pdf.rect(0, top + (slice.end - slice.start), pageWidth, pageHeight, 'F');

    pdf.setTextColor(0, 26, 71);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(`BFP - PJ · ${options.title}`, PAGE_MARGIN_MM, PAGE_MARGIN_MM + 4);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(90, 98, 112);
    pdf.text(
      `${options.subtitle ? `${options.subtitle} · ` : ''}Gerado em ${generatedAt} · Dados sintéticos (LGPD)`,
      PAGE_MARGIN_MM,
      PAGE_MARGIN_MM + 9,
    );
    pdf.text(`${page + 1} / ${pages}`, pageWidth - PAGE_MARGIN_MM, pageHeight - 5, {
      align: 'right',
    });
  }

  pdf.save(`${slugify(options.title)}.pdf`);
}
