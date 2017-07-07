const Umzug = require('umzug');
const path = require('path');

function wrap(sequelize, call) {
  const value = call(sequelize.getQueryInterface(),
    sequelize.constructor,
    sequelize.Promise);

  return (!Array.isArray(value) && value ? [value] : value || [])
    .reduce((prev, cur) => prev.then(() => cur()), Promise.resolve());
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

  const umzug = new Umzug({
    storage: 'json',
    storageOptions: {
      path: (options && options.configFile) || 'umzug.json',
    },
    migrations: {
      path: (options && options.baseDir) || 'migrations',
      pattern: /\.js$/,
      wrap: fn =>
        function $fn() {
          return wrap(sequelize, fn);
        },
    },
    logging() {
      /* istanbul ignore else */
      if (options && options.logging === 'function') {
        options.logging(Array.prototype.slice.call(arguments));
      }
    },
  });

  return {
    up: params => cmdMigrate(umzug, params),
    down: params => cmdReset(umzug, params),
    next: () => cmdMigrateNext(umzug),
    prev: () => cmdResetPrev(umzug),
    status: () => cmdStatus(umzug),
  };
};
