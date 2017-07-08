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
  // FIXME: avoid circular reference
  const util = require('./util');

  const mock = {};

  mock.findOne = _findOne(util.copy(dump));
  mock.findAll = _findAll(util.copy(dump));

  return mock;
};
