'use strict';

const jsf = require('json-schema-faker');

function _findAll(dump) {
  const defns = dump.definitions;

  delete dump.definitions;

  return () => jsf.resolve({
    type: 'array',
    items: dump,
    minItems: 1,
    definitions: defns,
  });
}

function _findOne(dump) {
  return () => jsf.resolve(dump);
}

module.exports = dump => {
  const mock = {};

  mock.findOne = _findOne(dump);
  mock.findAll = _findAll(dump);

  return mock;
};
