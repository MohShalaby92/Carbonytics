/**
 * Branded report rendering toolkit (§49) — a shared, theme-aware layer over
 * pdf-lib and docx so every Compliance export (GHG inventory, assurance, IMP,
 * CDP, SBTi, ESRS) renders as a presentable, brand-consistent PDF / Word
 * document instead of raw markdown. The Carbonytics dotted-C logo is embedded
 * on the cover and the running header; each framework gets its own accent
 * palette (CDP red/slate, SBTi navy/purple, ESRS EU-blue, Carbonytics green).
 *
 * No headless browser: pdf-lib draws the PDF (with wrap + auto-pagination +
 * cover + footer page numbers), docx builds the Word document (cover + themed
 * headings/tables + header/footer with the logo and page numbers).
 */
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, PDFImage, RGB } from 'pdf-lib';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ImageRun,
  Header,
  Footer,
  PageNumber,
  ShadingType,
} from 'docx';
import { BRAND_ICON_PNG_BASE64 } from '../assets/brandIcon';

const ICON_BUFFER = Buffer.from(BRAND_ICON_PNG_BASE64, 'base64');

export type ThemeKey = 'carbonytics' | 'cdp' | 'sbti' | 'esrs';

export interface Theme {
  key: ThemeKey;
  /** Framework badge shown on the cover (e.g. "CDP", "SBTi"). */
  badge: string;
  /** Primary accent (cover band, headings, table headers) as 0-255 RGB. */
  accent: [number, number, number];
  /** Secondary accent for rules / sub-emphasis. */
  secondary: [number, number, number];
  /** Dark ink for titles. */
  ink: [number, number, number];
}

export const THEMES: Record<ThemeKey, Theme> = {
  // Carbonytics brand — deep green + navy ink.
  carbonytics: { key: 'carbonytics', badge: 'GHG Protocol', accent: [31, 148, 94], secondary: [19, 36, 44], ink: [19, 36, 44] },
  // CDP — magenta/red accent + slate-blue tables (per the CDP questionnaire style).
  cdp: { key: 'cdp', badge: 'CDP Climate Change', accent: [194, 31, 74], secondary: [78, 93, 112], ink: [40, 40, 40] },
  // SBTi — deep navy + purple (per the SBTi monitoring-report style).
  sbti: { key: 'sbti', badge: 'SBTi', accent: [13, 43, 91], secondary: [107, 45, 132], ink: [13, 43, 91] },
  // ESRS E1 (CSRD) — EU blue.
  esrs: { key: 'esrs', badge: 'ESRS E1 · CSRD', accent: [28, 63, 143], secondary: [78, 93, 112], ink: [22, 34, 60] },
};

/**
 * pdf-lib standard fonts are WinAnsi (CP1252) and throw on out-of-range chars.
 * Map the punctuation/symbols the reports use to ASCII, drop the rest.
 */
export const pdfSafe = (s: any): string =>
  String(s ?? '')
    .replace(/→/g, '->')
    .replace(/[—–]/g, '-')
    .replace(/…/g, '...')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (m) => '0123456789'['₀₁₂₃₄₅₆₇₈₉'.indexOf(m)])
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/·/g, '-')
    .replace(/[^\x00-\xFF]/g, '');

const day = (iso: any) => String(iso || '').split('T')[0];

// ------------------------------------------------------------------ PDF

export interface CoverInfo {
  title: string;
  subtitle?: string;
  meta?: [string, string][]; // label/value rows (org, period, generated…)
  note?: string; // footer note on the cover
}

export class BrandedPdf {
  doc!: PDFDocument;
  font!: PDFFont;
  bold!: PDFFont;
  theme!: Theme;
  reportName = '';
  icon?: PDFImage;
  page!: PDFPage;
  y = 0;
  readonly pageW = 595.28;
  readonly pageH = 841.89; // A4
  readonly margin = 50;
  readonly footerSpace = 38;
  readonly headerSpace = 44;
  private coverDrawn = false;

  get maxW() { return this.pageW - this.margin * 2; }
  private col(c: [number, number, number]): RGB { return rgb(c[0] / 255, c[1] / 255, c[2] / 255); }
  private grey(v: number): RGB { return rgb(v, v, v); }

  static async create(theme: Theme, reportName: string): Promise<BrandedPdf> {
    const b = new BrandedPdf();
    b.doc = await PDFDocument.create();
    b.font = await b.doc.embedFont(StandardFonts.Helvetica);
    b.bold = await b.doc.embedFont(StandardFonts.HelveticaBold);
    b.theme = theme;
    b.reportName = reportName;
    try { b.icon = await b.doc.embedPng(ICON_BUFFER); } catch { /* icon optional */ }
    return b;
  }

  private wrap(text: string, f: PDFFont, size: number, width: number): string[] {
    const words = pdfSafe(text).replace(/\s+/g, ' ').trim().split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(t, size) > width && cur) { lines.push(cur); cur = w; } else { cur = t; }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  /** Slim running header drawn at the top of every content page. */
  private drawRunningHeader() {
    const topY = this.pageH - 26;
    if (this.icon) {
      const s = 16;
      this.page.drawImage(this.icon, { x: this.margin, y: topY - 3, width: s, height: s });
    }
    this.page.drawText(pdfSafe(`Carbonytics  ·  ${this.reportName}`), {
      x: this.margin + 22, y: topY + 1, size: 8, font: this.bold, color: this.col(this.theme.accent),
    });
    this.page.drawLine({
      start: { x: this.margin, y: this.pageH - this.headerSpace + 6 }, end: { x: this.pageW - this.margin, y: this.pageH - this.headerSpace + 6 },
      thickness: 0.75, color: this.grey(0.85),
    });
  }

  private newPage(withHeader = true) {
    this.page = this.doc.addPage([this.pageW, this.pageH]);
    if (withHeader) { this.drawRunningHeader(); this.y = this.pageH - this.headerSpace - 6; }
    else { this.y = this.pageH - this.margin; }
  }

  private ensure(h: number) {
    if (this.y - h < this.margin + this.footerSpace) this.newPage(true);
  }

  /** Cover page: accent band with logo + framework badge, then title + meta. */
  cover(info: CoverInfo) {
    this.page = this.doc.addPage([this.pageW, this.pageH]);
    const bandH = 132;
    // accent band
    this.page.drawRectangle({ x: 0, y: this.pageH - bandH, width: this.pageW, height: bandH, color: this.col(this.theme.accent) });
    // white logo chip + wordmark
    const chip = 46;
    const cx = this.margin, cy = this.pageH - 46 - chip;
    this.page.drawRectangle({ x: cx, y: cy, width: chip, height: chip, color: rgb(1, 1, 1), borderColor: rgb(1, 1, 1), borderWidth: 0, opacity: 1 });
    if (this.icon) this.page.drawImage(this.icon, { x: cx + 5, y: cy + 5, width: chip - 10, height: chip - 10 });
    this.page.drawText('Carbonytics', { x: cx + chip + 12, y: cy + chip - 22, size: 20, font: this.bold, color: rgb(1, 1, 1) });
    this.page.drawText('Data. Insight. Impact.', { x: cx + chip + 12, y: cy + chip - 38, size: 9, font: this.font, color: rgb(1, 1, 1), opacity: 0.85 });
    // framework badge (right)
    const badge = pdfSafe(this.theme.badge.toUpperCase());
    const bw = this.bold.widthOfTextAtSize(badge, 8) + 16;
    this.page.drawRectangle({ x: this.pageW - this.margin - bw, y: this.pageH - 52, width: bw, height: 18, color: rgb(1, 1, 1), opacity: 0.18 });
    this.page.drawText(badge, { x: this.pageW - this.margin - bw + 8, y: this.pageH - 47, size: 8, font: this.bold, color: rgb(1, 1, 1) });

    // title block
    this.y = this.pageH - bandH - 54;
    for (const ln of this.wrap(info.title, this.bold, 26, this.maxW)) {
      this.page.drawText(ln, { x: this.margin, y: this.y, size: 26, font: this.bold, color: this.col(this.theme.ink) });
      this.y -= 31;
    }
    if (info.subtitle) {
      this.y -= 4;
      for (const ln of this.wrap(info.subtitle, this.font, 12, this.maxW)) {
        this.page.drawText(ln, { x: this.margin, y: this.y, size: 12, font: this.font, color: this.grey(0.4) });
        this.y -= 17;
      }
    }
    // accent rule
    this.y -= 10;
    this.page.drawRectangle({ x: this.margin, y: this.y, width: 64, height: 3, color: this.col(this.theme.accent) });
    this.y -= 28;
    // meta rows
    for (const [k, v] of info.meta || []) {
      this.ensureCover(22);
      this.page.drawText(pdfSafe(k.toUpperCase()), { x: this.margin, y: this.y, size: 8, font: this.bold, color: this.grey(0.45) });
      for (const ln of this.wrap(String(v), this.font, 11, this.maxW - 150)) {
        this.page.drawText(ln, { x: this.margin + 150, y: this.y, size: 11, font: this.font, color: this.col(this.theme.ink) });
        this.y -= 15;
      }
      this.y -= 7;
    }
    if (info.note) {
      this.y = this.margin + 24;
      for (const ln of this.wrap(info.note, this.font, 8, this.maxW)) {
        this.page.drawText(ln, { x: this.margin, y: this.y, size: 8, font: this.font, color: this.grey(0.5) });
        this.y -= 11;
      }
    }
    this.coverDrawn = true;
    this.newPage(true);
  }

  private ensureCover(h: number) { if (this.y - h < this.margin) this.y = this.margin; }

  heading(t: string) {
    this.ensure(26);
    this.y -= 6;
    this.page.drawText(pdfSafe(t), { x: this.margin, y: this.y, size: 13, font: this.bold, color: this.col(this.theme.accent) });
    this.y -= 6;
    this.page.drawLine({ start: { x: this.margin, y: this.y }, end: { x: this.pageW - this.margin, y: this.y }, thickness: 0.75, color: this.col(this.theme.accent) });
    this.y -= 12;
  }

  subheading(t: string) {
    this.ensure(18);
    this.y -= 2;
    this.page.drawText(pdfSafe(t), { x: this.margin, y: this.y, size: 11, font: this.bold, color: this.col(this.theme.ink) });
    this.y -= 15;
  }

  para(text: string, opts: { size?: number; indent?: number; color?: RGB; gap?: number; bold?: boolean } = {}) {
    const size = opts.size ?? 10;
    const f = opts.bold ? this.bold : this.font;
    const indent = opts.indent ?? 0;
    const gap = opts.gap ?? 4;
    for (const ln of this.wrap(text, f, size, this.maxW - indent)) {
      this.ensure(size + gap);
      this.page.drawText(ln, { x: this.margin + indent, y: this.y, size, font: f, color: opts.color ?? this.grey(0.13) });
      this.y -= size + gap;
    }
  }

  kv(k: string, v: any) {
    this.ensure(14);
    const ks = `${k}: `;
    this.page.drawText(pdfSafe(ks), { x: this.margin + 8, y: this.y, size: 10, font: this.bold, color: this.col(this.theme.ink) });
    const kw = this.bold.widthOfTextAtSize(pdfSafe(ks), 10);
    const lines = this.wrap(String(v), this.font, 10, this.maxW - 8 - kw);
    this.page.drawText(lines[0] || '', { x: this.margin + 8 + kw, y: this.y, size: 10, font: this.font, color: this.grey(0.13) });
    this.y -= 14;
    for (let i = 1; i < lines.length; i++) { this.ensure(14); this.page.drawText(lines[i], { x: this.margin + 8 + kw, y: this.y, size: 10, font: this.font, color: this.grey(0.13) }); this.y -= 14; }
  }

  bullet(t: string, indent = 18) {
    const lines = this.wrap(t, this.font, 9, this.maxW - indent);
    this.ensure(9 + 3);
    this.page.drawText('-', { x: this.margin + indent - 8, y: this.y, size: 9, font: this.bold, color: this.col(this.theme.accent) });
    this.page.drawText(lines[0] || '', { x: this.margin + indent, y: this.y, size: 9, font: this.font, color: this.grey(0.2) });
    this.y -= 12;
    for (let i = 1; i < lines.length; i++) { this.ensure(12); this.page.drawText(lines[i], { x: this.margin + indent, y: this.y, size: 9, font: this.font, color: this.grey(0.2) }); this.y -= 12; }
  }

  note(t: string) { this.para(t, { size: 8, indent: 8, color: this.grey(0.45) }); }

  table(cols: string[], widths: number[], rows: string[][]) {
    const size = 9;
    const drawRow = (cells: string[], f: PDFFont, fill?: RGB, textColor?: RGB) => {
      const cellLines = cells.map((c, i) => this.wrap(c, f, size, widths[i] - 6));
      const lineCount = Math.max(...cellLines.map((l) => l.length));
      const rowH = lineCount * (size + 2) + 6;
      this.ensure(rowH);
      if (fill) this.page.drawRectangle({ x: this.margin, y: this.y - rowH + (size + 3), width: this.maxW, height: rowH, color: fill });
      const top = this.y - 2;
      for (let li = 0; li < lineCount; li++) {
        let x = this.margin + 3;
        for (let ci = 0; ci < cells.length; ci++) {
          const ln = cellLines[ci][li] || '';
          this.page.drawText(ln, { x, y: top - li * (size + 2), size, font: f, color: textColor ?? this.grey(0.15) });
          x += widths[ci];
        }
      }
      this.y -= rowH;
    };
    drawRow(cols, this.bold, this.col(this.theme.accent), rgb(1, 1, 1));
    rows.forEach((row, i) => drawRow(row, this.font, i % 2 ? this.grey(0.96) : undefined));
    this.y -= 6;
  }

  /** Stamp footers (page X of N + brand) on every page and return the buffer. */
  async finish(): Promise<Buffer> {
    const pages = this.doc.getPages();
    const n = pages.length;
    pages.forEach((p, i) => {
      const fy = this.margin - 18;
      p.drawLine({ start: { x: this.margin, y: fy + 12 }, end: { x: this.pageW - this.margin, y: fy + 12 }, thickness: 0.5, color: this.grey(0.85) });
      p.drawText(pdfSafe(`Carbonytics  ·  ${this.reportName}`), { x: this.margin, y: fy, size: 7.5, font: this.font, color: this.grey(0.5) });
      const pn = `Page ${i + 1} of ${n}`;
      const w = this.font.widthOfTextAtSize(pn, 7.5);
      p.drawText(pn, { x: this.pageW - this.margin - w, y: fy, size: 7.5, font: this.font, color: this.grey(0.5) });
    });
    return Buffer.from(await this.doc.save());
  }
}

// ------------------------------------------------------------------ DOCX

const hex = (c: [number, number, number]) => c.map((v) => v.toString(16).padStart(2, '0')).join('');

export interface DocxKit {
  theme: Theme;
  reportName: string;
  h: (t: string) => Paragraph;
  sub: (t: string) => Paragraph;
  p: (t: string, opts?: { bold?: boolean; italics?: boolean; color?: string; size?: number }) => Paragraph;
  bullet: (t: string) => Paragraph;
  table: (header: string[], rows: string[][]) => Table;
  /** Assemble the final document (cover + header/footer + body) -> Buffer. */
  build: (cover: CoverInfo, body: any[]) => Promise<Buffer>;
}

export function docxKit(theme: Theme, reportName: string): DocxKit {
  const accent = hex(theme.accent);
  const ink = hex(theme.ink);

  const h = (t: string) =>
    new Paragraph({
      spacing: { before: 240, after: 100 },
      border: { bottom: { color: accent, space: 2, style: BorderStyle.SINGLE, size: 8 } },
      children: [new TextRun({ text: t, bold: true, size: 26, color: accent })],
    });
  const sub = (t: string) =>
    new Paragraph({ spacing: { before: 120, after: 60 }, children: [new TextRun({ text: t, bold: true, size: 22, color: ink })] });
  const p = (t: string, opts: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {}) =>
    new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: t, size: opts.size ?? 20, bold: opts.bold, italics: opts.italics, color: opts.color })] });
  const bullet = (t: string) =>
    new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [new TextRun({ text: t, size: 20 })] });

  const cell = (text: string, header: boolean) =>
    new TableCell({
      shading: header ? { type: ShadingType.SOLID, color: accent, fill: accent } : undefined,
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: [new Paragraph({ children: [new TextRun({ text: text, bold: header, size: 18, color: header ? 'FFFFFF' : undefined })] })],
    });
  const table = (header: string[], rows: string[][]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ tableHeader: true, children: header.map((c) => cell(c, true)) }),
        ...rows.map((r) => new TableRow({ children: r.map((c) => cell(c, false)) })),
      ],
    });

  const build = async (cover: CoverInfo, body: any[]): Promise<Buffer> => {
    const coverChildren: any[] = [
      new Paragraph({
        spacing: { after: 60 },
        children: [
          new ImageRun({ type: 'png', data: ICON_BUFFER, transformation: { width: 40, height: 40 } }),
          new TextRun({ text: '  Carbonytics', bold: true, size: 30, color: accent }),
          new TextRun({ text: `    ${theme.badge}`, size: 16, color: '888888' }),
        ],
      }),
      new Paragraph({ spacing: { before: 360, after: 80 }, children: [new TextRun({ text: cover.title, bold: true, size: 48, color: ink })] }),
    ];
    if (cover.subtitle) coverChildren.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: cover.subtitle, size: 24, color: '666666' })] }));
    (cover.meta || []).forEach(([k, v]) =>
      coverChildren.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: `${k}:  `, bold: true, size: 20, color: accent }), new TextRun({ text: String(v), size: 20, color: ink })] }))
    );
    if (cover.note) coverChildren.push(new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: cover.note, size: 16, color: '888888', italics: true })] }));
    coverChildren.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

    const doc = new Document({
      sections: [
        {
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  border: { bottom: { color: 'DDDDDD', space: 1, style: BorderStyle.SINGLE, size: 6 } },
                  children: [
                    new ImageRun({ type: 'png', data: ICON_BUFFER, transformation: { width: 12, height: 12 } }),
                    new TextRun({ text: `  Carbonytics  ·  ${reportName}`, size: 14, color: accent, bold: true }),
                  ],
                }),
              ],
            }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  border: { top: { color: 'DDDDDD', space: 1, style: BorderStyle.SINGLE, size: 6 } },
                  children: [
                    new TextRun({ text: `Carbonytics  ·  ${reportName}  ·  Page `, size: 14, color: '888888' }),
                    new TextRun({ children: [PageNumber.CURRENT], size: 14, color: '888888' }),
                    new TextRun({ text: ' of ', size: 14, color: '888888' }),
                    new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: '888888' }),
                  ],
                }),
              ],
            }),
          },
          children: [...coverChildren, ...body],
        },
      ],
    });
    return Buffer.from(await Packer.toBuffer(doc));
  };

  return { theme, reportName, h, sub, p, bullet, table, build };
}

export const fmtDay = day;
