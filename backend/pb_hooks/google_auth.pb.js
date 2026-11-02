/// <reference path="../pb_data/types.d.ts" />

// Google sign-in follows GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on every start, so the secret
// stays out of git and the setup survives rebuilds, resets and new machines. Without them, the
// sign-in option is off. New accounts take their name and picture from Google.
onBootstrap((e) => {
  e.next(); // the database is ready after this

  const clientId = $os.getenv('GOOGLE_CLIENT_ID');
  const clientSecret = $os.getenv('GOOGLE_CLIENT_SECRET');
  const users = e.app.findCollectionByNameOrId('users');

  users.oauth2.enabled = !!(clientId && clientSecret);
  users.oauth2.providers = users.oauth2.enabled ? [{ name: 'google', clientId, clientSecret }] : [];
  users.oauth2.mappedFields.name = 'name';
  users.oauth2.mappedFields.avatarURL = 'avatar';
  e.app.save(users);
});
