/**
 * Azure Functions v4 — routed HTTP trigger.
 *
 * The adapter routes /api/health, /api/validate, /api/validate/batch
 * internally, so we register one wildcard route and let the adapter dispatch.
 */
import { app } from '@azure/functions';

// Production:
// import { azureHandler } from '@emailcheck/email-validator-js/serverless/azure';

// Local development against the source:
import { azureHandler } from '../../../../../src/serverless/adapters/azure';

app.http('validateEmail', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: '{*path}', // wildcard → adapter does the routing
  handler: azureHandler,
});
