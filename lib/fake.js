'use strict';

const jsf = require('json-schema-faker');

function _findAll(schema) {
  return () => jsf({
    type: 'array',
    items: schema,
    minItems: 1,
  });
}

function _findOne(schema) {
  return () => jsf(schema);
}

module.exports = schema => {
  const mock = {};

  mock.findOne = _findOne(schema);
  mock.findAll = _findAll(schema);

  return mock;
};
