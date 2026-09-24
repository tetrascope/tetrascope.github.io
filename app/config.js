/* Deployment configuration for TetraScope.
 *
 * appUrl    public address used in share links (null = the current page).
 *
 * firebase  null = no cloud features: everything works, collection and
 *           feedback stay in the visitor's browser, no sign-in button.
 *
 *           Fill it in to enable (1) "Sign in with Google" with collection
 *           sync and (2) a cloud inbox for feedback. Use the web-app config
 *           of a Firebase project you control - ideally RockMin ID's project,
 *           so one account works in both apps and saved samples appear in
 *           both (same collections and document schema as RockMin ID's
 *           firestore.rules). Setup steps: README, "Google sign-in".
 *
 *           Web API keys are not secrets (they are visible in every client),
 *           but restrict the key to your domains in the Google Cloud console.
 */
window.OHARA_CONFIG = {
  appUrl: "https://tetrascope.github.io/app/",
  firebase: null
  // firebase: {
  //   apiKey: "AIza...",
  //   authDomain: "your-project.firebaseapp.com",
  //   projectId: "your-project",
  //   appId: "1:1234567890:web:abcdef",
  //   databaseId: "(default)"          // only if you use a named Firestore database
  // }
};
