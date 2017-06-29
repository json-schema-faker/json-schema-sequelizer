'use strict';

const util = require('./util');

module.exports = (deps, params) =>
  util
    .sortModels(deps)
    .reduce((prev, cur) =>
      prev.then(() => cur.sync(params))
    , Promise.resolve());
