## Plan: Email notification for reservation confirmation/rejection

TL;DR: Add an Outlook SMTP email integration as a new external notification service, then dispatch confirmation/rejection emails from the existing reservation routes. Follow the current CSC/Teams integration pattern: asynchronous send, integration logging, and history audit.

**Steps**
1. Add an SMTP email integration dependency and environment configuration.
   - Install `nodemailer` or equivalent SMTP client.
   - Add env vars to `.env.example`: `OUTLOOK_SMTP_HOST`, `OUTLOOK_SMTP_PORT`, `OUTLOOK_SMTP_USER`, `OUTLOOK_SMTP_PASS`, `OUTLOOK_FROM_EMAIL`, `OUTLOOK_TO_EMAILS`.

2. Create the Outlook/email integration module.
   - Add `src/lib/integrations/outlook.ts` or `src/lib/integrations/email.ts`.
   - Implement a `sendEmail` function that reads SMTP credentials from env vars, composes the message, and throws a custom `EmailError` on failure.
   - Keep the API simple: `sendEmail({ to, subject, html, text })`.

3. Add reservation email notification service logic.
   - Create `src/services/email.service.ts` or extend `src/services/integracao.service.ts` with methods for confirmation and rejection emails.
   - Add email template builders for confirmed and rejected reservations, using the same structure from the attached message examples:
     - reservation title, dates and times, laboratory location, professor, course/turma, and support contact.
     - rejection email should clearly state there are no available laboratories for requested dates.
   - Target recipients via configured env variable so the operator account can manage the destination list.

4. Wire email notifications into confirm/reject routes.
   - In `src/app/api/reservas/confirmar/route.ts`, after the reservation transaction commits and after audit log fire-and-forget, call the email send method asynchronously.
   - In `src/app/api/reservas/rejeitar/route.ts`, after `ReservaService.rejeitar` and audit log, call the rejection email send method asynchronously.
   - Preserve current semantics: success response should not fail if email send fails, but errors must be logged.

5. Add logging and history tracking for email events.
   - Update `prisma/schema.prisma` to add a new `TipoEvento` enum value, e.g. `ENVIO_EMAIL` or separate `ENVIO_EMAIL_CONFIRMACAO` / `ENVIO_EMAIL_REJEICAO`.
   - Update `src/types/index.ts` `eventoLabel` for the new event label.
   - In email send flow, create `historicoTramitacao` and `logIntegracao` entries similar to CSC/Teams.
   - Use `servico: 'OUTLOOK'` or `servico: 'EMAIL'` in `logIntegracao` and include payload/resposta/erro.

6. Add tests for the new email integration.
   - Unit tests for the Outlook/email client that mock SMTP send and verify the right message parameters.
   - Service tests for the reservation email methods, mocking the integration module and confirming logs/history creation.
   - Route or integration tests for `confirmar` and `rejeitar` to ensure the asynchronous email method is invoked.

7. Document configuration and deploy-time setup.
   - Update `.env.example` with the new SMTP env vars.
   - Add README notes under "Integrações" describing the Outlook SMTP settings and recipient config.

**Relevant files**
- `c:\Users\SUPORTE-IEC-288319\iec-laboratorios\src\app\api\reservas\confirmar\route.ts`
- `c:\Users\SUPORTE-IEC-288319\iec-laboratorios\src\app\api\reservas\rejeitar\route.ts`
- `c:\Users\SUPORTE-IEC-288319\iec-laboratorios\src\services\integracao.service.ts`
- `c:\Users\SUPORTE-IEC-288319\iec-laboratorios\src\lib\integrations\teams.ts`
- `c:\Users\SUPORTE-IEC-288319\iec-laboratorios\src\lib\integrations\csc.ts`
- `c:\Users\SUPORTE-IEC-288319\iec-laboratorios\src\types\index.ts`
- `c:\Users\SUPORTE-IEC-288319\iec-laboratorios\prisma\schema.prisma`
- `c:\Users\SUPORTE-IEC-288319\iec-laboratorios\.env.example`
- `c:\Users\SUPORTE-IEC-288319\iec-laboratorios\src\tests\integracao.service.test.ts`

**Verification**
1. Run `npm test` targeting the new email integration and reservation service tests.
2. Start the app with SMTP env vars pointed to the Outlook account and perform a reservation confirm and reject flow.
3. Confirm the email arrives with the expected subject/body and that `logIntegracao` records a `OUTLOOK`/`EMAIL` entry.
4. Confirm `historicoTramitacao` has the new email event for confirmation/rejection.

**Decisions**
- Use SMTP via Outlook account because no existing mail client is installed in the repo.
- Use configurable recipient list (`OUTLOOK_TO_EMAILS`) instead of a hard-coded alias.
- Send emails for all confirmed/rejected reservations, not only PRESENCIAL.
- Keep email sending asynchronous to avoid blocking the route response.

**Further considerations**
1. If the support email must include CC to professor or requester, add `cc` support in the email helper.
2. If the operator account should be the actual sender, set `OUTLOOK_FROM_EMAIL` to the operator mailbox and use that SMTP login.
3. If the project eventually migrates to Microsoft Graph, encapsulate the email API behind a service interface now to minimize future changes.