module.exports = {
  $schema: {
    properties: {
      id: {
        $ref: 'dataTypes#/definitions/primaryKey',
      },
      name: {
        type: 'string',
      },
    },
    required: ['id', 'name'],
  },
  hooks: require('./hooks.js'),
};
