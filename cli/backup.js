'use strict';

const path = require('path');
const glob = require('glob');
const fs = require('fs-extra');

const JSONSchemaSequelizer = require('../lib');

module.exports = (conn, config) => {
  const _cwd = process.cwd();
  const _umzug = JSONSchemaSequelizer.migrate(conn.sequelize);

  const _allowed = typeof config.options.only === 'string'
    ? String(config.options.only).split(',')
    : [];

  /* istanbul ignore else */
  if (Array.isArray(config.options.only)) {
    Array.prototype.push.apply(_allowed, config.options.only);
  }

  const _models = Object.keys(conn.models)
    .filter(x => (_allowed.length ? _allowed.indexOf(x) !== -1 : true))
    .map(x => conn.models[x]);

  const _logger = config.logger || {};

  _logger.error = _logger.error || console.error.bind(console);
  _logger.message = _logger.message || console.log.bind(console);

  function load() {
    /* istanbul ignore else */
    if (typeof config.options.load !== 'string') {
      throw new Error(`Invalid directory to --load, given '${config.options.load}'`);
    }

    const src = path.resolve(_cwd, config.options.load);
    const after = path.resolve(path.dirname(src), config.options.after || 'after.js');
    const before = path.resolve(path.dirname(src), config.options.before || 'after.js');

    return Promise.resolve()
      .then(() => _umzug.run(before))
      .then(() => Promise.all(_models.filter(x => !x.virtual)
        .map(x => {
          const file = glob.sync(`**/${x.name}.json`, { cwd: src })[0];

          /* istanbul ignore else */
          if (!file) {
            return _logger.message(`${x.name} was skipped`);
          }

          return x
            .bulkCreate(fs.readJsonSync(path.join(src, file)))
            .then(() => {
              _logger.message(`${x.name} was loaded`);
            });
        })))
      .then(() => _umzug.run(after));
  }

  function save() {
    const fulldate = [
      new Date().getFullYear(),
      `0${new Date().getMonth() + 1}`.substr(-2),
      `0${new Date().getDate() + 1}`.substr(-2),
    ].join('');

    const hourtime = [
      `0${new Date().getHours()}`.substr(-2),
      `0${new Date().getMinutes()}`.substr(-2),
      `0${new Date().getSeconds()}`.substr(-2),
      '.',
      `000${new Date().getMilliseconds()}`.substr(-3),
    ].join('');

    return Promise.all(_models.filter(x => !x.virtual)
      .map(x => x
        .findAll({
          order: [[x.primaryKeyAttribute, 'ASC']],
          // FIXME: export nested-data instead?
          raw: true,
        })
        .then(data => ({ data, model: x }))))
      .then(results => {
        const _buffer = [];

        results.forEach(result => {
          /* istanbul ignore else */
          if (config.options.save) {
            /* istanbul ignore else */
            if (typeof config.options.save !== 'string') {
              throw new Error(`Invalid directory to --save, given '${config.options.save}'`);
            }

            const file = path.join(_cwd, config.options.save, `${fulldate}${hourtime}`, `${result.model.name}.json`);

            fs.outputJsonSync(file, result.data, { spaces: 2 });

            return _logger.message(`write ${path.relative(_cwd, file)}`);
          }

          _buffer.push(`\r\n--- BEGIN ${result.model.name} ---\n${JSON.stringify(result.data, null, 2)}\n--- END ${result.model.name} ---\n`);
        });

        /* istanbul ignore else */
        if (_buffer.length) {
          _logger.message(_buffer.join(''));
        }
      });
  }

  return Promise.resolve()
    .then(() => (config.options.load ? load() : save()));
};
