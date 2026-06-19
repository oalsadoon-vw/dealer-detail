/**
 * Tekion OpenAPI response types — only the fields we actually read.
 *
 * Money convention: every *Amount is INTEGER CENTS (8999 = $89.99).
 */

export type EpochMs = number;

export interface TekionTag {
  field: string;
  value: string;
}

export interface TekionVehicleSummary {
  vin?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  mileage?: number | null;
}

/**
 * Tekion search responses embed associations as HATEOAS link envelopes:
 *   { link: "/users/<uuid>", id: "<uuid>" }
 * So `assignee.advisor.id` is the user id of the advisor (the ticket's
 * canonical advisor-id path).
 */
export interface TekionLinkRef {
  link?: string | null;
  id?: string | null;
}

export interface TekionAssignee {
  advisor?: TekionLinkRef | null;
  technicians?: TekionLinkRef[] | null;
  department?: TekionLinkRef | null;
}

/**
 * RepairOrder as returned by /repair-orders:search. The canonical primary
 * key is `documentId`; the human-facing identifier is `documentNumber`.
 * There is no flat `id` field on the search payload.
 */
export interface RepairOrder {
  documentId: string;
  documentNumber?: string | null;
  status?: string | null;
  type?: string | null;
  creationTime?: EpochMs | null;
  invoicedTime?: EpochMs | null;
  closedTime?: EpochMs | null;
  modifiedTime?: EpochMs | null;
  assignee?: TekionAssignee | null;
  vehicle?: TekionVehicleSummary | TekionLinkRef | null;
  tags?: TekionTag[] | null;
  createdByUserId?: TekionLinkRef | null;
  modifiedByUserId?: TekionLinkRef | null;
}

export interface Job {
  id?: string | null;
  jobId?: string | null;
  documentId?: string | null;
  status?: string | null;
  // raw responses may carry many other fields — passthrough for forward-compat
  [key: string]: unknown;
}

export interface OperationLabor {
  saleAmount?: number | null;
  costAmount?: number | null;
}

export interface Operation {
  id?: string | null;
  documentId?: string | null;
  opcode?: string | null;
  opcodeDescription?: string | null;
  labor?: OperationLabor | null;
  [key: string]: unknown;
}

export interface PartQuantity {
  type?: string | null;
  value?: number | null;
}

export interface Part {
  id?: string | null;
  documentId?: string | null;
  partNumber?: string | null;
  quantities?: PartQuantity[] | null;
  saleAmount?: number | null;
  costAmount?: number | null;
  [key: string]: unknown;
}

export interface RoVehicle {
  vin?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  mileage?: number | null;
}

export interface RepairOrderSnapshot {
  ro: RepairOrder;
  vehicle: RoVehicle | null;
  jobs: Array<{
    job: Job;
    operations: Array<{
      operation: Operation;
      parts: Part[];
    }>;
  }>;
  advisorName: string | null;
  advisorPersona?: string | null;
}

export type FilterOperator = "GT" | "GTE" | "LT" | "LTE" | "IN" | "NIN" | "BTW" | "BOOL";

export type FilterField =
  | "opcode"
  | "make"
  | "status"
  | "vin"
  | "documentNumber"
  | "documentId"
  | "creationTime"
  | "invoicedTime"
  | "closedTime"
  | "modifiedTime"
  | "paytype";

export interface SearchFilter {
  field: FilterField;
  operator: FilterOperator;
  values: string[];
}

export interface SearchMeta {
  totalCount?: number;
  nextPageToken?: string | null;
}

export interface RepairOrderSearchPage {
  results: RepairOrder[];
  meta: SearchMeta;
}

export interface TokenResponse {
  access_token: string;
  expire_on?: number;
  token_type?: string;
}
