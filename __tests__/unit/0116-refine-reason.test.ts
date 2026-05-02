/**
 * `refineReasonByEnhancedStatus` — RFC 3463 enhanced-status-code refinement
 * helper. Pure function, no I/O.
 */
import { describe, expect, it } from 'bun:test';
import { refineReasonByEnhancedStatus } from '../../src';

describe('0116 refineReasonByEnhancedStatus — passthrough cases', () => {
  it('returns the original reason when enhancedStatus is null', () => {
    expect(refineReasonByEnhancedStatus('not_found', null)).toBe('not_found');
  });

  it('returns the original reason when enhancedStatus is undefined', () => {
    expect(refineReasonByEnhancedStatus('not_found', undefined)).toBe('not_found');
  });

  it('returns the original reason when DSN is unknown', () => {
    expect(refineReasonByEnhancedStatus('not_found', '5.9.99')).toBe('not_found');
  });

  it('returns "unknown" when reason is undefined and DSN matches no rule', () => {
    expect(refineReasonByEnhancedStatus(undefined, null)).toBe('unknown');
  });

  it('returns the refined reason when DSN matches even if input reason is undefined', () => {
    expect(refineReasonByEnhancedStatus(undefined, '5.1.1')).toBe('mailbox_does_not_exist');
  });
});

describe('0116 refineReasonByEnhancedStatus — addressing (X.1.x)', () => {
  it('5.1.1 → mailbox_does_not_exist', () => {
    expect(refineReasonByEnhancedStatus('not_found', '5.1.1')).toBe('mailbox_does_not_exist');
  });

  it('5.1.2 → bad_destination_system', () => {
    expect(refineReasonByEnhancedStatus('not_found', '5.1.2')).toBe('bad_destination_system');
  });

  it('5.1.3 → bad_destination_address', () => {
    expect(refineReasonByEnhancedStatus('not_found', '5.1.3')).toBe('bad_destination_address');
  });

  it('5.1.6 → mailbox_moved', () => {
    expect(refineReasonByEnhancedStatus('not_found', '5.1.6')).toBe('mailbox_moved');
  });

  it('5.1.10 → recipient_address_has_null_mx', () => {
    expect(refineReasonByEnhancedStatus('not_found', '5.1.10')).toBe('recipient_address_has_null_mx');
  });
});

describe('0116 refineReasonByEnhancedStatus — mailbox status (X.2.x)', () => {
  it('5.2.0 → mailbox_status_other', () => {
    expect(refineReasonByEnhancedStatus('not_found', '5.2.0')).toBe('mailbox_status_other');
  });

  it('5.2.1 → mailbox_disabled', () => {
    expect(refineReasonByEnhancedStatus('not_found', '5.2.1')).toBe('mailbox_disabled');
  });

  it('5.2.2 → mailbox_full', () => {
    expect(refineReasonByEnhancedStatus('over_quota', '5.2.2')).toBe('mailbox_full');
  });

  it('5.2.3 → message_too_long', () => {
    expect(refineReasonByEnhancedStatus('ambiguous', '5.2.3')).toBe('message_too_long');
  });

  it('5.2.4 → mailing_list_expansion_problem', () => {
    expect(refineReasonByEnhancedStatus('ambiguous', '5.2.4')).toBe('mailing_list_expansion_problem');
  });
});

describe('0116 refineReasonByEnhancedStatus — network (X.4.x)', () => {
  it('4.4.1 → no_answer_from_host', () => {
    expect(refineReasonByEnhancedStatus('temporary_failure', '4.4.1')).toBe('no_answer_from_host');
  });

  it('4.4.2 → bad_connection', () => {
    expect(refineReasonByEnhancedStatus('temporary_failure', '4.4.2')).toBe('bad_connection');
  });
});

describe('0116 refineReasonByEnhancedStatus — security/policy (X.7.x)', () => {
  it('5.7.0 → security_other', () => {
    expect(refineReasonByEnhancedStatus('ambiguous', '5.7.0')).toBe('security_other');
  });

  it('5.7.1 → delivery_not_authorized', () => {
    expect(refineReasonByEnhancedStatus('ambiguous', '5.7.1')).toBe('delivery_not_authorized');
  });

  it('5.7.25 → no_reverse_dns', () => {
    expect(refineReasonByEnhancedStatus('ambiguous', '5.7.25')).toBe('no_reverse_dns');
  });

  it('5.7.26 → multiple_authentication_failures', () => {
    expect(refineReasonByEnhancedStatus('ambiguous', '5.7.26')).toBe('multiple_authentication_failures');
  });
});

describe('0116 refineReasonByEnhancedStatus — does not change verifier output', () => {
  it('refinement is opt-in — caller decides whether to use it', () => {
    // Documenting the contract: callers receive the coarse reason from
    // verifyMailboxSMTP and choose whether to refine. The helper never
    // mutates input.
    const original = 'not_found';
    const refined = refineReasonByEnhancedStatus(original, '5.1.1');
    expect(refined).not.toBe(original);
    expect(refined).toBe('mailbox_does_not_exist');
  });
});
