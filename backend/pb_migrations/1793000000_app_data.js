/// <reference path="../pb_data/types.d.ts" />

// The app's data, one collection per kind. Every row belongs to one user and holds one item:
// `key` is the app's own id for it and `data` is the item as JSON. Rules keep each user to
// their own rows, and rows go when the account does.
const COLLECTIONS = [
  'sessions',
  'routines',
  'exercises',
  'programs',
  'body_stats',
  'photos',
  'scheduled_days',
  'exercise_records',
  'user_state',
];

const OWN = 'user = @request.auth.id';
const SETS_SELF = '@request.body.user = @request.auth.id';

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    for (const name of COLLECTIONS) {
      const fields = [
        { name: 'user', type: 'relation', collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
        { name: 'key', type: 'text', required: true },
        { name: 'data', type: 'json', maxSize: 10 * 1024 * 1024 },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ];
      if (name === 'photos') {
        fields.push({ name: 'image', type: 'file', maxSelect: 1, maxSize: 10 * 1024 * 1024, mimeTypes: ['image/jpeg'], protected: true });
      }
      app.save(
        new Collection({
          type: 'base',
          name,
          listRule: OWN,
          viewRule: OWN,
          createRule: `@request.auth.id != "" && ${SETS_SELF}`,
          updateRule: `${OWN} && (@request.body.user:isset = false || ${SETS_SELF})`,
          deleteRule: OWN,
          fields,
          indexes: [`CREATE UNIQUE INDEX idx_${name}_user_key ON ${name} (user, key)`],
        }),
      );
    }
  },
  (app) => {
    for (const name of COLLECTIONS) app.delete(app.findCollectionByNameOrId(name));
  },
);
