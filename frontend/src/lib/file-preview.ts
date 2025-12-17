export type FileCategory =
  | "image"
  | "video"
  | "audio"
  | "text"
  | "pdf"
  | "document"
  | "other";

export const OFFICE_EXTENSIONS = {
  WORD: ["doc", "docx"],
  EXCEL: ["xls", "xlsx"],
  POWERPOINT: ["ppt", "pptx"],
} as const;

export const ALL_OFFICE_EXTENSIONS = [
  ...OFFICE_EXTENSIONS.WORD,
  ...OFFICE_EXTENSIONS.EXCEL,
  ...OFFICE_EXTENSIONS.POWERPOINT,
] as const;

export const MAMMOTH_SUPPORTED_EXTENSIONS = ["docx"] as const;

export const LEGACY_OFFICE_EXTENSIONS = ["doc", "xls", "ppt"] as const;

export const getFileExtension = (fileName: string): string => {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
};

export const isOfficeDocument = (fileName: string): boolean => {
  const ext = getFileExtension(fileName);
  return (ALL_OFFICE_EXTENSIONS as readonly string[]).includes(ext);
};

export const isWordDocument = (fileName: string): boolean => {
  const ext = getFileExtension(fileName);
  return (OFFICE_EXTENSIONS.WORD as readonly string[]).includes(ext);
};

export const isMammothSupported = (fileName: string): boolean => {
  const ext = getFileExtension(fileName);
  return (MAMMOTH_SUPPORTED_EXTENSIONS as readonly string[]).includes(ext);
};

export const isLegacyOfficeFormat = (fileName: string): boolean => {
  const ext = getFileExtension(fileName);
  return (LEGACY_OFFICE_EXTENSIONS as readonly string[]).includes(ext);
};

export const getFileCategory = (
  mimeType: string,
  fileName: string
): FileCategory => {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("text/")) return "text";
  if (mimeType === "application/pdf") return "pdf";

  if (
    mimeType.includes("document") ||
    mimeType.includes("word") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType.includes("presentation") ||
    mimeType.includes("powerpoint") ||
    mimeType.includes("officedocument")
  ) {
    return "document";
  }

  if (isOfficeDocument(fileName)) {
    return "document";
  }

  return "other";
};

export const getOfficePreviewErrorMessage = (
  fileName: string
): string | null => {
  const ext = getFileExtension(fileName);

  if (ext === "doc") {
    return "Preview is not available for legacy .doc files. Please download the file to view it, or convert it to .docx format.";
  }

  if (ext === "xls") {
    return "Preview is not available for legacy .xls files. Please download the file to view it, or convert it to .xlsx format.";
  }

  if (ext === "ppt") {
    return "Preview is not available for legacy .ppt files. Please download the file to view it, or convert it to .pptx format.";
  }

  if (["xlsx", "ppt", "pptx"].includes(ext)) {
    return "Preview is currently only available for .docx (Word) documents. Please download the file to view it.";
  }

  return null;
};

export const isLegacyFormatError = (error: Error | string): boolean => {
  const errorMessage = typeof error === "string" ? error : error.message;
  return (
    errorMessage.includes("zip file") ||
    errorMessage.includes("central directory") ||
    errorMessage.includes("OOXML")
  );
};

export const createDocViewerDocument = (url: string, fileName: string) => {
  return {
    uri: url,
    fileName: fileName,
    fileType: getFileExtension(fileName) || undefined,
  };
};
