/**
 * RFC 3463 enhanced-status-code refinement.
 *
 * `verifyMailboxSMTP` returns a coarse reason vocabulary (`not_found`,
 * `over_quota`, `temporary_failure`, `ambiguous`, …) — enough for routing
 * decisions but not for end-user messaging. When the MX includes an
 * enhanced status code in its reply (e.g. `5.1.1` for "user unknown" vs
 * `5.7.1` for "policy block"), this helper maps the code to a more
 * specific reason string.
 *
 * Pure utility — does not change `verifyMailboxSMTP`'s default output.
 * Callers opt in by piping `result.error` and `result.enhancedStatus`
 * through this helper:
 *
 * ```ts
 * import { refineReasonByEnhancedStatus, verifyMailboxSMTP } from
 *   '@emailcheck/email-validator-js';
 *
 * const { smtpResult } = await verifyMailboxSMTP({ ... });
 * const refined = refineReasonByEnhancedStatus(
 *   smtpResult.error,
 *   smtpResult.enhancedStatus
 * );
 * // refined: e.g. 'mailbox_does_not_exist' instead of plain 'not_found'
 * ```
 *
 * Returns the original `reason` unchanged when no mapping applies — so
 * callers can always use the result in place of the original reason.
 *
 * Mapping coverage (all RFC 3463 codes worth distinguishing in the wild):
 *
 * | DSN code | Refined reason                       |
 * | -------- | ------------------------------------ |
 * | 5.1.1    | `mailbox_does_not_exist`             |
 * | 5.1.2    | `bad_destination_system`             |
 * | 5.1.3    | `bad_destination_address`            |
 * | 5.1.6    | `mailbox_moved`                      |
 * | 5.1.10   | `recipient_address_has_null_mx`      |
 * | 5.2.0    | `mailbox_status_other`               |
 * | 5.2.1    | `mailbox_disabled`                   |
 * | 5.2.2    | `mailbox_full`                       |
 * | 5.2.3    | `message_too_long`                   |
 * | 5.2.4    | `mailing_list_expansion_problem`     |
 * | 4.4.1    | `no_answer_from_host`                |
 * | 4.4.2    | `bad_connection`                     |
 * | 5.7.0    | `security_other`                     |
 * | 5.7.1    | `delivery_not_authorized`            |
 * | 5.7.25   | `no_reverse_dns`                     |
 * | 5.7.26   | `multiple_authentication_failures`   |
 *
 * Codes not in the table return the original `reason` unchanged. Use the
 * raw `enhancedStatus` for finer custom mapping.
 */
const REFINEMENT_TABLE: Record<string, string> = {
  // X.1.x — addressing
  '5.1.1': 'mailbox_does_not_exist',
  '5.1.2': 'bad_destination_system',
  '5.1.3': 'bad_destination_address',
  '5.1.6': 'mailbox_moved',
  '5.1.10': 'recipient_address_has_null_mx',
  // X.2.x — mailbox status
  '5.2.0': 'mailbox_status_other',
  '5.2.1': 'mailbox_disabled',
  '5.2.2': 'mailbox_full',
  '5.2.3': 'message_too_long',
  '5.2.4': 'mailing_list_expansion_problem',
  // X.4.x — network / routing
  '4.4.1': 'no_answer_from_host',
  '4.4.2': 'bad_connection',
  // X.7.x — security / policy
  '5.7.0': 'security_other',
  '5.7.1': 'delivery_not_authorized',
  '5.7.25': 'no_reverse_dns',
  '5.7.26': 'multiple_authentication_failures',
};

export function refineReasonByEnhancedStatus(
  reason: string | undefined,
  enhancedStatus: string | null | undefined
): string {
  const base = reason ?? 'unknown';
  if (!enhancedStatus) return base;
  return REFINEMENT_TABLE[enhancedStatus] ?? base;
}
