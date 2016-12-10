'use strict';

const jsf = require('json-schema-faker/lib');

function _findAll(schema, refs) {
  return () => jsf({
    type: 'array',
    items: schema,
  }, refs);
}

function _findOne(schema, refs) {
  return () => jsf(schema, refs);
}

module.exports = (schema, refs) => {
  const mock = {};

  mock.findOne = _findOne(schema, refs);
  mock.findAll = _findAll(schema, refs);

  return mock;
};
