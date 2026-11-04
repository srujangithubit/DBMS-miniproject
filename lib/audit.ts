import { writeAuditEvent, type AuditEvent } from './mongo';

// Audit logging must not turn a successful transactional operation into a failed user action.
// Errors are written to server logs; the core SQL result remains the source of truth.
export async function safeAudit(event: AuditEvent): Promise<void> {
  try {
    await writeAuditEvent(event);
  } catch (error) {
    console.error('MongoDB audit event could not be written:', error instanceof Error ? error.message : error);
  }
}
