/**
 * ONLYOFFICE Document Server TypeScript Type Definitions
 * Based on official ONLYOFFICE API documentation
 */

export type DocumentType = "word" | "cell" | "slide" | "pdf";

export type EditorMode = "edit" | "view";

export interface DocumentPermissions {
  /** Allow chat functionality */
  chat?: boolean;
  /** Allow commenting */
  comment?: boolean;
  /** Allow copying content */
  copy?: boolean;
  /** Configure comment groups permissions */
  commentGroups?: {
    edit?: string[];
    remove?: string[];
    view?: string;
  };
  /** Only author can delete their comments */
  deleteCommentAuthorOnly?: boolean;
  /** Allow downloading the document */
  download?: boolean;
  /** Allow editing the document */
  edit?: boolean;
  /** Only author can edit their comments */
  editCommentAuthorOnly?: boolean;
  /** Allow filling forms */
  fillForms?: boolean;
  /** Allow modifying content controls */
  modifyContentControl?: boolean;
  /** Allow modifying filters */
  modifyFilter?: boolean;
  /** Allow printing */
  print?: boolean;
  /** Allow protecting document */
  protect?: boolean;
  /** Allow review mode */
  review?: boolean;
  /** Groups that can review */
  reviewGroups?: string[];
  /** Groups with user info access */
  userInfoGroups?: string[];
}

export interface DocumentInfo {
  /** Is document in favorites */
  favorite?: boolean;
  /** Folder path */
  folder?: string;
  /** Document owner name */
  owner?: string;
  /** Sharing settings */
  sharingSettings?: Array<{
    permissions: string;
    user: string;
    isLink?: boolean;
  }>;
  /** Upload timestamp */
  uploaded?: string;
}

export interface DocumentReferenceData {
  /** File key for reference */
  fileKey?: string;
  /** Instance ID */
  instanceId?: string;
}

export interface DocumentConfig {
  /** File type extension (e.g., "docx", "xlsx", "pptx") */
  fileType: string;
  /** Unique document identifier for caching */
  key: string;
  /** Document title */
  title: string;
  /** URL where the document is stored */
  url: string;
  /** Document permissions */
  permissions?: DocumentPermissions;
  /** Is this a form document */
  isForm?: boolean;
  /** Additional document info */
  info?: DocumentInfo;
  /** Reference data */
  referenceData?: DocumentReferenceData;
}

export interface CoEditingConfig {
  /** Co-editing mode: "fast" or "strict" */
  mode?: "fast" | "strict";
  /** Allow changing co-editing mode */
  change?: boolean;
}

export interface AnonymousConfig {
  /** Request anonymous access */
  request?: boolean;
  /** Label for anonymous users */
  label?: string;
}

export interface CloseConfig {
  /** Show close button */
  visible?: boolean;
  /** Close button text */
  text?: string;
}

export interface CustomerConfig {
  /** Customer address */
  address?: string;
  /** Additional info */
  info?: string;
  /** Logo URL */
  logo?: string;
  /** Dark theme logo URL */
  logoDark?: string;
  /** Contact email */
  mail?: string;
  /** Customer name */
  name?: string;
  /** Contact phone */
  phone?: string;
  /** Website URL */
  www?: string;
}

export interface FeaturesConfig {
  /** Show features tips */
  featuresTips?: boolean;
  /** Enable roles feature */
  roles?: boolean;
  /** Spellcheck settings */
  spellcheck?: {
    mode?: boolean;
    change?: boolean;
  };
  /** Tab background settings */
  tabBackground?: {
    mode?: string;
    change?: boolean;
  };
  /** Tab style settings */
  tabStyle?: {
    mode?: string;
    change?: boolean;
  };
}

export interface FeedbackConfig {
  /** Feedback URL */
  url?: string;
  /** Show feedback button */
  visible?: boolean;
}

export interface FontConfig {
  /** Font name */
  name?: string;
  /** Font size */
  size?: string;
}

export interface GobackConfig {
  /** Open in blank window */
  blank?: boolean;
  /** Go back button text */
  text?: string;
  /** Go back URL */
  url?: string;
}

export interface LayoutHeaderConfig {
  /** Show edit mode toggle */
  editMode?: boolean;
  /** Show save button */
  save?: boolean;
  /** Show user info */
  user?: boolean;
  /** Show users list */
  users?: boolean;
}

export interface LayoutLeftMenuConfig {
  /** Left menu mode */
  mode?: boolean;
  /** Show navigation */
  navigation?: boolean;
}

export interface LayoutConfig {
  /** Header layout configuration */
  header?: LayoutHeaderConfig;
  /** Left menu layout configuration */
  leftMenu?: LayoutLeftMenuConfig;
}

export interface CustomizationConfig {
  /** Show about section */
  about?: boolean;
  /** Anonymous user settings */
  anonymous?: AnonymousConfig;
  /** Enable autosave */
  autosave?: boolean;
  /** Close button configuration */
  close?: CloseConfig;
  /** Enable comments */
  comments?: boolean;
  /** Use compact header */
  compactHeader?: boolean;
  /** Use compact toolbar */
  compactToolbar?: boolean;
  /** Enable compatible features */
  compatibleFeatures?: boolean;
  /** Customer branding */
  customer?: CustomerConfig;
  /** Features configuration */
  features?: FeaturesConfig;
  /** Feedback configuration */
  feedback?: FeedbackConfig;
  /** Font settings */
  font?: FontConfig;
  /** Enable forcesave */
  forcesave?: boolean;
  /** Force western font size */
  forceWesternFontSize?: boolean;
  /** Go back configuration */
  goback?: GobackConfig;
  /** Show help */
  help?: boolean;
  /** Hide notes */
  hideNotes?: boolean;
  /** Hide right menu */
  hideRightMenu?: boolean;
  /** Hide rulers */
  hideRulers?: boolean;
  /** Integration mode */
  integrationMode?: "embed" | "default";
  /** Layout configuration */
  layout?: LayoutConfig;
  /** Toolbar with no tabs */
  toolbarNoTabs?: boolean;
}

export interface UserConfig {
  /** User ID */
  id?: string;
  /** User name */
  name?: string;
}

export interface EditorConfig {
  /** Callback URL for document events */
  callbackUrl?: string;
  /** Co-editing configuration */
  coEditing?: CoEditingConfig;
  /** Create document URL */
  createUrl?: string;
  /** Customization options */
  customization?: CustomizationConfig;
  /** Editor language (e.g., "en", "fr") */
  lang?: string;
  /** Editor mode: "edit" or "view" */
  mode?: EditorMode;
  /** User information */
  user?: UserConfig;
}

export interface OnlyOfficeConfig {
  /** Document configuration */
  document: DocumentConfig;
  /** Document type */
  documentType: DocumentType;
  /** Editor configuration */
  editorConfig?: EditorConfig;
  /** Editor height (CSS value or number) */
  height?: string | number;
  /** Editor width (CSS value or number) */
  width?: string | number;
  /** JWT token for secure configuration */
  token?: string;
  /** Editor type: "desktop" or "embedded" */
  type?: "desktop" | "embedded";
}

export interface DocsAPIDocEditor {
  /** Destroy the editor instance */
  destroyEditor(): void;
  /** Other methods can be added as needed */
}

export interface DocsAPI {
  DocEditor: new (
    containerId: string,
    config: OnlyOfficeConfig,
  ) => DocsAPIDocEditor;
}

declare global {
  interface Window {
    DocsAPI?: DocsAPI;
  }
}
