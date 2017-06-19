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
  classMethods: {
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
