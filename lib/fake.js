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
  const base = util.fixRefs(dump);
  const mock = {};

  mock.findOne = _findOne(util.copy(base));
  mock.findAll = _findAll(util.copy(base));

  return mock;
};
