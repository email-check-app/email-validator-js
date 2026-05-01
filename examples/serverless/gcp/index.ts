/**
 * Google Cloud Functions (2nd gen) — minimal entry point.
 *
 * Deploy:
 *   gcloud functions deploy validateEmail \
 *     --gen2 \
 *     --runtime=nodejs20 \
 *     --trigger-http \
 *     --allow-unauthenticated \
 *     --region=us-central1 \
 *     --entry-point=validateEmail
 *
 * Routes (under the function URL):
 *   GET  /health
 *   POST /validate          { "email": "..." }
 *   POST /validate/batch    { "emails": ["...", "..."] }
 */

// Production:
// import { gcpHandler } from '@emailcheck/email-validator-js/serverless/gcp';

// Local development against the source:
import { gcpHandler } from '../../../src/serverless/adapters/gcp';

export const validateEmail = gcpHandler;

// Alternative single-route convenience (no internal routing — body picks
// single vs. batch). Wire it instead of `gcpHandler` if you want one
// function URL = one endpoint.
//
// import { gcpFunction } from '@emailcheck/email-validator-js/serverless/gcp';
// export const validateEmail = gcpFunction;
