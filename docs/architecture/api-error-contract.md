# API Error Contract

## Standard error response

```json
{
  "code": "MACHINE_READABLE_CODE",
  "message": "Human-readable explanation",
  "details": {}
}
```

## Fields
- `code` (required): stable key for client-side branching and analytics
- `message` (required): readable explanation for UI and logs
- `details` (optional): structured context (debug-safe, no secrets)

## Usage
- Route handlers should use `sendError(...)` from:
  - `server/http/errors.ts`
- Success payloads remain route-specific.

## Status guidelines
- `400`: invalid input, invalid transition, unsupported action
- `401`: unauthenticated
- `403`: authenticated but forbidden
- `404`: entity not found
- `409`: conflict (idempotency conflict, concurrent update conflict)
- `422`: semantically invalid request
- `500`: unexpected internal failures
- `503`: dependency unavailable

## Code naming guidelines
- Upper snake case
- Scoped by domain when useful:
  - `CASE_NOT_FOUND`
  - `INVALID_CASE_TRANSITION`
  - `APPROVAL_NOT_FOUND`
  - `AI_RESPONSE_PARSE_FAILED`

