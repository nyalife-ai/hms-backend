/**
 * Billing persistence port — fee schedule, settlement, claim sync, M-Pesa checkout.
 */

export const BILLING_REPOSITORY = Symbol('BILLING_REPOSITORY');

export type BillLineInput = { description: string; amount: number };

export type SettleVisitInput = {
  createdByUserId: string;
  mrn: string;
  patientName: string;
  lines: BillLineInput[];
  total: number;
  mode: 'CASH' | 'CLAIM' | 'MPESA';
  claimExternalId?: string;
  providerId?: string;
  policyNumber?: string;
  diagnosis?: string;
  mpesaReceipt?: string;
  transactionReference?: string;
  /** Extra billable clinical services / surgeries (by billing.services id). */
  extraServiceIds?: string[];
};

export type SettleVisitResult = {
  invoiceId: string;
  invoiceNumber: string;
  paymentId?: string;
  claimNumber?: string;
  claimDbId?: string;
};

export type CheckoutVisitRow = {
  id: string;
  patient_name: string;
  mrn: string;
  age: number;
  gender: string;
  phone: string;
  first_visit: boolean;
  stage: string;
  checked_in_at: Date;
  payload: unknown;
};

export type MpesaTransactionRow = {
  id: string;
  checkout_request_id: string;
  merchant_request_id: string | null;
  phone: string;
  amount: unknown;
  status: string;
  visit_id: string | null;
  patient_id: string | null;
  source: string;
  initiated_by: string;
  payload: unknown;
  mpesa_receipt_number: string | null;
  result_code: string | null;
  result_desc: string | null;
  created_at: Date;
};

export type CreateMpesaTransactionInput = {
  checkoutRequestId: string;
  merchantRequestId?: string;
  phone: string;
  amount: number;
  accountReference: string;
  description: string;
  visitId: string;
  patientId?: string;
  source: string;
  initiatedBy: string;
  payload: unknown;
  /** Lifecycle status; default PENDING for legacy callers. */
  status?: string;
};

export type UpdateMpesaTransactionInput = {
  status?: string;
  resultCode?: string | null;
  resultDesc?: string | null;
  mpesaReceiptNumber?: string | null;
  payload?: unknown;
  checkoutRequestId?: string;
  merchantRequestId?: string | null;
};

export type CreateReceiptInput = {
  receiptNumber: string;
  patientId: string;
  visitId: string;
  invoiceId: string;
  paymentId?: string;
  mpesaTransactionId: string;
  channel: string;
  amount: number;
  issuedBy: string;
  lineItems: unknown;
  meta: unknown;
};

export type ReceiptRow = {
  id: string;
  receipt_number: string;
  channel: string;
  amount: unknown;
  issued_at: Date;
  visit_id: string | null;
  invoice_id: string | null;
  payment_id: string | null;
  patient_id: string;
  line_items: unknown;
  meta: unknown;
  mpesa_transaction_id: string | null;
};

export type ReceiptPatientRow = {
  patient_number: string;
  profile: { first_name: string; last_name: string; phone: string | null } | null;
};

export interface IBillingRepository {
  isConnected(): boolean;
  findActiveServicePrices(
    codes: string[],
  ): Promise<Array<{ service_code: string; standard_price: unknown }>>;
  ensureFeeScheduleSeed(): Promise<void>;
  findPatientByMrn(
    mrn: string,
  ): Promise<{ id: string; patient_number: string } | null>;
  countInvoices(): Promise<number>;
  settleVisit(input: SettleVisitInput): Promise<SettleVisitResult>;
  syncClaimStatus(
    claimNumber: string,
    gatewayStatus: 'SUBMITTED' | 'ACCEPTED' | 'REJECTED',
  ): Promise<void>;

  findVisitForCheckout(visitId: string): Promise<CheckoutVisitRow | null>;
  updateVisitCheckout(
    visitId: string,
    data: { stage: string; payload: unknown },
  ): Promise<void>;
  createMpesaTransaction(
    input: CreateMpesaTransactionInput,
  ): Promise<MpesaTransactionRow>;
  findMpesaById(id: string): Promise<MpesaTransactionRow | null>;
  findMpesaByCheckoutRequestId(
    checkoutRequestId: string,
  ): Promise<MpesaTransactionRow | null>;
  updateMpesaTransaction(
    id: string,
    data: UpdateMpesaTransactionInput,
  ): Promise<MpesaTransactionRow>;
  /**
   * Atomically claim a PENDING row (updateMany where status=PENDING).
   * Returns the row when this caller won the race; otherwise null.
   */
  claimMpesaPending(
    id: string,
    data: UpdateMpesaTransactionInput,
  ): Promise<MpesaTransactionRow | null>;
  findReceiptByMpesaTxId(mpesaTxId: string): Promise<ReceiptRow | null>;
  findReceiptById(id: string): Promise<ReceiptRow | null>;
  countReceipts(): Promise<number>;
  createReceipt(input: CreateReceiptInput): Promise<ReceiptRow>;
  findPatientForReceipt(patientId: string): Promise<ReceiptPatientRow | null>;
  /** Active ADMIN / SUPER_ADMIN / ACCOUNTANT user ids for payment alerts. */
  findBillingAlertUserIds(): Promise<string[]>;
}
