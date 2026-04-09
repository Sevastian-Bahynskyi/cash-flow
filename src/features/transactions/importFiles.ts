import { File } from 'expo-file-system';

const csvMimeHints = [
  'text/csv',
  'application/csv',
  'text/comma-separated-values',
  'application/vnd.ms-excel',
  'text/plain',
] as const;

export type CsvImportFile = {
  fileUri: string;
  fileName: string | null;
  mimeType: string | null;
};

export type PendingImport =
  | ({
      id: string;
      kind: 'csv';
    } & CsvImportFile);

const hasCsvExtension = (value: string | null | undefined): boolean =>
  typeof value === 'string' && /\.csv$/i.test(value.trim());

export const isCsvMimeType = (value: string | null | undefined): boolean =>
  typeof value === 'string' &&
  csvMimeHints.some((hint) => value.trim().toLowerCase().includes(hint));

export const isCsvImportFile = ({
  fileName,
  mimeType,
}: {
  fileName?: string | null;
  mimeType?: string | null;
}): boolean => hasCsvExtension(fileName) || isCsvMimeType(mimeType);

export const readCsvImportText = async (fileUri: string): Promise<string> => {
  const file = new File(fileUri);
  const text = (await file.text()).replace(/^\uFEFF/, '').trim();
  if (text.length === 0) {
    throw new Error('This CSV file is empty.');
  }
  return text;
};
