import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, any>[];
}

@Injectable()
export class ExcelParserService {
  private readonly logger = new Logger(ExcelParserService.name);

  /**
   * Parse an uploaded XLSX/CSV buffer into structured data.
   * @param buffer  File buffer from Multer
   * @param options Optional: sheet name or 0-based index (default: first sheet)
   */
  async parse(
    buffer: Buffer,
    options?: { sheetName?: string; sheetIndex?: number },
  ): Promise<ParsedSheet> {
    const workbook = new ExcelJS.Workbook();

    // Detect CSV by trying xlsx first; fall back to csv
    try {
      await workbook.xlsx.load(buffer as any);
    } catch {
      // Not a valid xlsx — try CSV
      const csvText = buffer.toString('utf-8');
      const stream = new (await import('stream')).Readable();
      stream.push(csvText);
      stream.push(null);
      await workbook.csv.read(stream);
    }

    const sheet = this.resolveSheet(workbook, options);
    if (!sheet || sheet.rowCount === 0) {
      throw new Error('工作表为空或不存在');
    }

    const headers = this.extractHeaders(sheet);
    const rows = this.extractRows(sheet, headers);

    this.logger.log(
      `Parsed sheet "${sheet.name}": ${headers.length} columns, ${rows.length} rows`,
    );

    return { headers, rows };
  }

  /**
   * List available sheet names in a workbook buffer.
   */
  async listSheets(buffer: Buffer): Promise<string[]> {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as any);
    } catch {
      return ['Sheet1']; // CSV has a single implicit sheet
    }
    return workbook.worksheets.map((ws) => ws.name);
  }

  // ---- private helpers ----

  private resolveSheet(
    workbook: ExcelJS.Workbook,
    options?: { sheetName?: string; sheetIndex?: number },
  ): ExcelJS.Worksheet | undefined {
    if (options?.sheetName) {
      return workbook.getWorksheet(options.sheetName);
    }
    if (options?.sheetIndex !== undefined) {
      return workbook.worksheets[options.sheetIndex];
    }
    return workbook.worksheets[0];
  }

  private extractHeaders(sheet: ExcelJS.Worksheet): string[] {
    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      headers[colNumber - 1] = String(cell.value ?? '').trim();
    });
    // Fill gaps with empty strings up to last populated column
    return headers.map((h) => h ?? '');
  }

  private extractRows(
    sheet: ExcelJS.Worksheet,
    headers: string[],
  ): Record<string, any>[] {
    const rows: Record<string, any>[] = [];
    // Start from row 2 (skip header)
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      // Skip completely empty rows
      if (!row.hasValues) continue;

      const record: Record<string, any> = {};
      let hasData = false;
      for (let c = 0; c < headers.length; c++) {
        const cell = row.getCell(c + 1);
        const value = this.extractCellValue(cell);
        if (headers[c]) {
          record[headers[c]] = value;
          if (value !== null && value !== '') hasData = true;
        }
      }
      if (hasData) rows.push(record);
    }
    return rows;
  }

  private extractCellValue(cell: ExcelJS.Cell): any {
    if (cell.value === null || cell.value === undefined) return null;

    // ExcelJS wraps rich text / formula in objects
    if (typeof cell.value === 'object') {
      if ('result' in cell.value) return (cell.value as any).result;
      if ('richText' in cell.value) {
        return (cell.value as any).richText
          .map((rt: any) => rt.text)
          .join('');
      }
      if ('text' in cell.value) return (cell.value as any).text;
      // Date values
      if (cell.value instanceof Date) return cell.value;
    }

    return cell.value;
  }
}
