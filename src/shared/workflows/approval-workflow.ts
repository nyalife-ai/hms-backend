export type ApprovalStatus =
  'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ApprovalStep {
  readonly approverId: string;
  readonly decision?: 'approved' | 'rejected';
  readonly decidedAt?: Date;
  readonly comment?: string;
}

export interface ApprovalState {
  readonly status: ApprovalStatus;
  readonly steps: readonly ApprovalStep[];
  readonly currentStepIndex: number;
}

const TRANSITIONS: Readonly<Record<ApprovalStatus, readonly ApprovalStatus[]>> =
  {
    draft: ['pending', 'cancelled'],
    pending: ['approved', 'rejected', 'cancelled'],
    approved: [],
    rejected: [],
    cancelled: [],
  };

function assertTransition(from: ApprovalStatus, to: ApprovalStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(
      `Cannot transition approval workflow from "${from}" to "${to}"`,
    );
  }
}

/**
 * Generic sequential multi-approver workflow. Each instance is immutable —
 * every mutating method returns a new {@link ApprovalWorkflow}.
 */
export class ApprovalWorkflow {
  private constructor(private readonly state: ApprovalState) {}

  public static create(approverIds: readonly string[]): ApprovalWorkflow {
    if (approverIds.length === 0) {
      throw new RangeError('Approval workflow requires at least one approver');
    }
    return new ApprovalWorkflow({
      status: 'draft',
      steps: approverIds.map((approverId) => ({ approverId })),
      currentStepIndex: 0,
    });
  }

  public get status(): ApprovalStatus {
    return this.state.status;
  }

  public get steps(): readonly ApprovalStep[] {
    return this.state.steps;
  }

  public get currentApproverId(): string | undefined {
    return this.state.status === 'pending'
      ? this.state.steps[this.state.currentStepIndex]?.approverId
      : undefined;
  }

  public submit(): ApprovalWorkflow {
    assertTransition(this.state.status, 'pending');
    return new ApprovalWorkflow({ ...this.state, status: 'pending' });
  }

  public cancel(): ApprovalWorkflow {
    assertTransition(this.state.status, 'cancelled');
    return new ApprovalWorkflow({ ...this.state, status: 'cancelled' });
  }

  /** Records a decision for the current step's approver and advances (or finalizes) the workflow. */
  public decide(
    approverId: string,
    decision: 'approved' | 'rejected',
    comment?: string,
    decidedAt: Date = new Date(),
  ): ApprovalWorkflow {
    if (this.state.status !== 'pending') {
      throw new Error(
        `Cannot record a decision while workflow status is "${this.state.status}"`,
      );
    }
    const step = this.state.steps[this.state.currentStepIndex];
    if (step === undefined) {
      throw new Error('Approval workflow has no pending step');
    }
    if (step.approverId !== approverId) {
      throw new Error(
        `Approver "${approverId}" is not authorized for the current step (expected "${step.approverId}")`,
      );
    }
    const steps = this.state.steps.map((current, index) =>
      index === this.state.currentStepIndex
        ? {
            ...current,
            decision,
            decidedAt,
            ...(comment === undefined ? {} : { comment }),
          }
        : current,
    );
    if (decision === 'rejected') {
      return new ApprovalWorkflow({
        ...this.state,
        steps,
        status: 'rejected',
      });
    }
    const nextIndex = this.state.currentStepIndex + 1;
    const isLastStep = nextIndex >= steps.length;
    return new ApprovalWorkflow({
      steps,
      currentStepIndex: isLastStep ? this.state.currentStepIndex : nextIndex,
      status: isLastStep ? 'approved' : 'pending',
    });
  }

  public toJSON(): ApprovalState {
    return { ...this.state, steps: [...this.state.steps] };
  }
}
