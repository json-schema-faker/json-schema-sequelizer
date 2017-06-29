'use strict';

module.exports = (deps, params, options) =>
  Promise.all(deps.map(model => model.destroy({
    truncate: params.truncate === true,
    where: options && Object.keys(options).length
      ? options
      : null,
  })));
