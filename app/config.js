/* Deployment configuration for the workbench.
 *
 * Feedback is always saved in the user's own browser. To also send it to a
 * cloud database, fill in a Firebase web config below. The workbench then
 * writes to the same `feedback` collection, with the same document schema,
 * as RockMin ID (see RockMin ID's firestore.rules, isValidFeedback), so both
 * apps can share one inbox. Leave `firebase` as null for local-only mode.
 *
 * Web API keys are not secrets, but the project must be one you control and
 * the key should be domain-restricted in the Google Cloud console.
 */
window.OHARA_CONFIG = {
  appUrl: "https://tetrascope.github.io/app/",  // public URL used in share links; null = current page
  firebase: null         // e.g. { apiKey: "...", projectId: "...", databaseId: "(default)" }
};
