'use strict';

const jsf = require('json-schema-faker');

function _findAll(schema) {
  return () => jsf.resolve({
    type: 'array',
    items: schema,
    minItems: 1,
  });
}

function _findOne(schema) {
  return () => jsf.resolve(schema);
}

module.exports = schema => {
  const mock = {};

  mock.findOne = _findOne(schema);
  mock.findAll = _findAll(schema);

  return mock;
};
