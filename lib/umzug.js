'use strict';

const Umzug = require('umzug');
const path = require('path');
const fs = require('fs');

function wrap(sequelize, call) {
  const value = call(sequelize.getQueryInterface(),
    sequelize.constructor,
    sequelize.Promise);

  return (!Array.isArray(value) && value ? [value] : value || [])
    .reduce((prev, cur) => prev.then(() => (typeof cur === 'function' ? cur() : cur)), Promise.resolve());
}

function cmdStatus(umzug) {
  const result = {};

  return Promise.resolve()
    .then(() => umzug.executed().then(executed => { result.executed = executed; }))
    .then(() => umzug.pending().then(pending => { result.pending = pending; }))
    .then(() => {
      result.executed = result.executed.map(x => path.basename(x.path));
      result.pending = result.pending.map(x => path.basename(x.path));
      return result;
    });
}

function cmdMigrate(umzug, params) {
  return umzug.up(params);
}

function cmdReset(umzug, params) {
  /* istanbul ignore else */
  if (!(params.to || params.from || params.migrations)) {
    params.to = 0;
  }

  return umzug.down(params);
}

function cmdMigrateNext(umzug) {
  return cmdStatus(umzug)
    .then(result => {
      /* istanbul ignore else */
      if (result.pending.length === 0) {
        return Promise.reject(new Error('No pending migrations'));
      }

      return umzug.up({ to: result.pending[0] });
    });
}

function cmdResetPrev(umzug) {
  return cmdStatus(umzug)
    .then(result => {
      /* istanbul ignore else */
      if (result.executed.length === 0) {
        return Promise.reject(new Error('Already at initial state'));
      }

      return umzug.down({ to: result.executed[result.executed.length - 1] });
    });
}

module.exports = (sequelize, options, bind) => {
  /* istanbul ignore else */
  if (bind) {
    Object.keys(options).forEach(key => {
      /* istanbul ignore else */
      if (typeof options[key] === 'function') {
        const cb = options[key].bind(null);

        options[key] = () => wrap(sequelize, cb);
      }
    });

    return options;
  }

  let umzug;

  const migrations = {
    path: (options && options.baseDir) || 'migrations',
    pattern: /\.js$/,
    wrap: fn => function $fn() {
      return wrap(sequelize, fn);
    },
  };

  const logging = function $logging() {
    /* istanbul ignore else */
    if (options && options.logging === 'function') {
      options.logging(Array.prototype.slice.call(arguments));
    }
  };

  // lazy load
  function _umzug() {
    if (options.database) {
      umzug = new Umzug({
        storage: 'sequelize',
        storageOptions: {
          sequelize,
          modelName: options.database.modelName || 'Schema',
          tableName: options.database.tableName || 'Schema',
          columnName: options.database.columnName || 'migration',
        },
        migrations,
        logging,
      });
    }

    umzug = umzug || new Umzug({
      storage: 'json',
      storageOptions: {
        path: options.configFile || 'umzug.json',
      },
      migrations,
      logging,
    });

    return umzug;
  }

  return {
    run: script => Promise.resolve().then(() => fs.existsSync(script) && wrap(sequelize, require(script))),
    up: params => cmdMigrate(_umzug(), params || {}),
    down: params => cmdReset(_umzug(), params || {}),
    next: () => cmdMigrateNext(_umzug()),
    prev: () => cmdResetPrev(_umzug()),
    status: () => (fs.existsSync(_umzug().options.migrations.path)
      ? cmdStatus(_umzug())
      : Promise.resolve({
        pending: [],
        executed: [],
      })),
  };
};
