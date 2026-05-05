import { IssueType } from '../geo.config';

export interface GeoIssueDetail {
  issueType: IssueType;
  /** Free-form structured detail (e.g. expected vs got). */
  detail?: Record<string, unknown>;
  /** Optional pointer to a specific campus when the issue is per-campus. */
  campusId?: number;
}

export interface ValidationReport {
  pass: boolean;
  issues: GeoIssueDetail[];
}
