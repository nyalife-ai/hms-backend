import { ApprovalWorkflow } from '../approval-workflow';

describe('ApprovalWorkflow', () => {
  it('requires at least one approver', () => {
    expect(() => ApprovalWorkflow.create([])).toThrow(RangeError);
  });

  it('tracks status and current approver through the draft/pending lifecycle', () => {
    const workflow = ApprovalWorkflow.create(['alice', 'bob']);
    expect(workflow.status).toBe('draft');
    expect(workflow.currentApproverId).toBeUndefined();
    const pending = workflow.submit();
    expect(pending.status).toBe('pending');
    expect(pending.currentApproverId).toBe('alice');
  });

  it('rejects invalid transitions', () => {
    const workflow = ApprovalWorkflow.create(['alice']);
    const pending = workflow.submit();
    expect(() => pending.submit()).toThrow(/Cannot transition/);
    const approved = pending.decide('alice', 'approved');
    expect(() => approved.cancel()).toThrow(/Cannot transition/);
  });

  it('cancels a draft or pending workflow', () => {
    const workflow = ApprovalWorkflow.create(['alice']);
    expect(workflow.cancel().status).toBe('cancelled');
    expect(workflow.submit().cancel().status).toBe('cancelled');
  });

  it('advances sequentially across multiple approvers and finalizes on the last approval', () => {
    const workflow = ApprovalWorkflow.create(['alice', 'bob']).submit();
    const afterAlice = workflow.decide('alice', 'approved', 'looks good');
    expect(afterAlice.status).toBe('pending');
    expect(afterAlice.currentApproverId).toBe('bob');
    expect(afterAlice.steps[0]).toMatchObject({
      approverId: 'alice',
      decision: 'approved',
      comment: 'looks good',
    });

    const afterBob = afterAlice.decide('bob', 'approved');
    expect(afterBob.status).toBe('approved');
    expect(afterBob.currentApproverId).toBeUndefined();
    expect(afterBob.steps[1]).toMatchObject({
      approverId: 'bob',
      decision: 'approved',
    });
  });

  it('rejects immediately when any approver rejects', () => {
    const workflow = ApprovalWorkflow.create(['alice', 'bob']).submit();
    const rejected = workflow.decide('alice', 'rejected', 'not ready');
    expect(rejected.status).toBe('rejected');
    expect(rejected.steps[0]).toMatchObject({ decision: 'rejected' });
  });

  it('rejects decisions from the wrong approver or wrong status', () => {
    const draft = ApprovalWorkflow.create(['alice']);
    expect(() => draft.decide('alice', 'approved')).toThrow(
      /status is "draft"/,
    );

    const pending = ApprovalWorkflow.create(['alice', 'bob']).submit();
    expect(() => pending.decide('bob', 'approved')).toThrow(/not authorized/);
  });

  it('uses an explicit decidedAt timestamp and serializes state', () => {
    const decidedAt = new Date('2024-01-01T00:00:00Z');
    const workflow = ApprovalWorkflow.create(['alice']).submit();
    const decided = workflow.decide('alice', 'approved', undefined, decidedAt);
    expect(decided.steps[0].decidedAt).toBe(decidedAt);
    expect(decided.toJSON()).toMatchObject({ status: 'approved' });
  });

  it('throws when no pending step remains', () => {
    const workflow = ApprovalWorkflow.create(['alice']).submit();
    const approved = workflow.decide('alice', 'approved');
    // Force an inconsistent state to exercise the missing-step guard.
    const forced = Object.create(
      ApprovalWorkflow.prototype,
    ) as ApprovalWorkflow;
    Object.assign(forced, {
      state: { status: 'pending', steps: [], currentStepIndex: 0 },
    });
    expect(() => forced.decide('alice', 'approved')).toThrow('no pending step');
    expect(approved.status).toBe('approved');
  });
});
