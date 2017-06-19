// FIXME: migrate this to classes/$new

module.exports = {
  $schema: {
    properties: {
      str: {
        type: 'string',
      },
    },
    required: ['str'],
  },
  staticMethods: {
    truth() {
      return 42;
    },
  },
  instanceMethods: {
    chain() {
      return this;
    },
  },
};
