'use strict';

const path = require('path');
const fs = require('fs-extra');

const JSONSchemaSequelizer = require('../lib');

function fixedName(value) {
  return value
    .replace(/([A-Z])/g, (_, $1) => `_${$1}`)
    .replace(/\W+/g, '_')
    .toLowerCase();
}

module.exports = (conn, config) => {
  return Promise.resolve()
    .then(() => {
      const _cwd = process.cwd();
      const _migrations = conn.sequelize.options.migrations || {};
      const _baseDir = _migrations.directory || conn.sequelize.options.directory;

      if (!fs.existsSync(_baseDir)) {
        throw new Error(`Missing ${_baseDir} directory`);
      }

      const _allowed = typeof config.options.only === 'string'
        ? String(config.options.only).split(',')
        : [];

      if (Array.isArray(config.options.only)) {
        Array.prototype.push.apply(_allowed, config.options.only);
      }

      const _models = Object.keys(conn.models)
        .filter(x => (_allowed.length ? _allowed.indexOf(x) !== -1 : true))
        .map(x => conn.models[x]);

      const _logger = config.logger || {};

      _logger.error = _logger.error || console.error.bind(console);
      _logger.message = _logger.message || console.log.bind(console);

      const schemaFile = path.join(_baseDir, 'schema.js');
      const schemaJson = path.join(_baseDir, 'schema.json');
      const migrationsDir = path.join(_baseDir, 'migrations');
      const migrationsFile = path.join(migrationsDir, 'index.json');

      function upgrade() {
        const fixedRefs = {};

        Object.keys(conn.$refs).forEach(ref => {
          /* istanbul ignore else */
          if (!_models[ref]) {
            fixedRefs[ref] = conn.$refs[ref].$schema;
          }
        });

        _logger.message(`write ${path.relative(_cwd, schemaJson)}`);

        fs.outputJsonSync(schemaJson,
          JSONSchemaSequelizer.bundle(_models, fixedRefs,
            typeof config.options.apply === 'string' && config.options.apply), { spaces: 2 });

        _logger.message(`${_models.length} model${_models.length === 1 ? '' : 's'} exported`);
      }

      function reset() {
        /* istanbul ignore else */
        if (!fs.existsSync(schemaFile)) {
          throw new Error(`Missing ${schemaFile} file`);
        }

        const migrations = glob.sync('*.js', { cwd: migrationsDir });

        if (config.options.create) {
          fs.outputJsonSync(migrationsFile, migrations, { spaces: 2 });
        } else {
          fs.outputFileSync(migrationsFile, '[]');
        }

        return Promise.resolve()
          .then(() => {
            _logger.message(`read ${path.relative(_cwd, schemaFile)}`);
          })
          .then(() => JSONSchemaSequelizer.migrate(conn.sequelize, require(schemaFile), true)[config.options.create ? 'up' : 'down']())
          .then(() => {
            _logger.message(`${config.options.use} ${config.options.create ? 'applied' : 'reverted'}`);
          });
      }

      function write() {
        const fulldate = [
          new Date().getFullYear(),
          `0${new Date().getMonth() + 1}`.substr(-2),
          `0${new Date().getDate() + 1}`.substr(-2),
        ].join('');

        const dump = fs.existsSync(schemaJson)
          ? fs.readJsonSync(schemaJson)
          : {};

        return JSONSchemaSequelizer.generate(dump || {}, _models, false, conn.sequelize.options.define)
          .then(results => {
            /* istanbul ignore else */
            if (!results.length) {
              _logger.message('Without changes');
              return;
            }

            results.forEach(result => {
              /* istanbul ignore else */
              if (!result.code) {
                return;
              }

              const hourtime = [
                `0${new Date().getHours()}`.substr(-2),
                `0${new Date().getMinutes()}`.substr(-2),
                `0${new Date().getSeconds()}`.substr(-2),
                '.',
                `000${new Date().getMilliseconds()}`.substr(-3),
              ].join('');

              const name = typeof config.options.make === 'string'
                ? `_${fixedName(config.options.make)}`
                : `_${result.code.indexOf('createTable') > -1 ? 'create' : 'update'}${fixedName(result.model.tableName)}`;

              const file = path.join(migrationsDir, `${fulldate}${hourtime}${name}.js`);
              const src = path.relative(_cwd, file);

              _logger.message(`write ${src}`);
              fs.outputFileSync(file, result.code);
            });
          });
      }

      function check() {
        let method = 'status';

        const params = {};

        ['up', 'down', 'prev', 'next'].forEach(key => {
          /* istanbul ignore else */
          if (config.options[key]) {
            method = key;

            /* istanbul ignore else */
            if (typeof config.options[key] === 'string') {
              params.migrations = params.migrations || [];
              params.migrations.push(config.options[key]);
            }
          }
        });

        ['from', 'to'].forEach(key => {
          /* istanbul ignore else */
          if (typeof config.options[key] === 'string') {
            params[key] = config.options[key];
          }
        });

        /* istanbul ignore else */
        if (Array.isArray(config.migrations) && config.migrations.length) {
          params.migrations = params.migrations || [];
          config.migrations.forEach(migration => {
            params.migrations.push(migration);
          });
        }

        return Promise.all([
          config.options.apply
            ? JSONSchemaSequelizer.generate({}, _models, true, conn.sequelize.options.define)
            : null,
          JSONSchemaSequelizer.migrate(conn.sequelize, {
            database: _migrations.database,
            configFile: migrationsFile,
            baseDir: migrationsDir,
            logging(message) {
              _logger.message(message);
            },
          })[method](params),
        ])
          .then(results => {
            const result = results[1];

            /* istanbul ignore else */
            if (results[0]) {
              _logger.message(`write ${path.relative(_cwd, schemaFile)}`);
              fs.outputFileSync(schemaFile, results[0].code);
            }

            if (!Array.isArray(result)) {
              /* istanbul ignore else */
              if (result.executed && result.executed.length === 0) {
                _logger.message('No executed migrations');
              }

              /* istanbul ignore else */
              if (result.pending && result.pending.length) {
                _logger.message('Pending migrations:');

                result.pending.forEach(x => {
                  _logger.message(`- ${x}`);
                });
              }

              /* istanbul ignore else */
              if (result.pending && result.pending.length === 0) {
                _logger.message('No pending migrations');
              }
            } else if (!result.length) {
              _logger.message('No changes were made');
            } else {
              _logger.message(`${result.length} migration${
                result.length === 1 ? '' : 's'
              } ${
                result.length === 1 ? 'was' : 'were'
              } ${
                config.options.up || config.options.next ? 'applied' : 'reverted'
              }`);
            }
          });
      }

      if (config.options.create || config.options.destroy) {
        return reset();
      }

      if (config.options.apply) {
        return (upgrade(), check());
      }

      if (config.options.make) {
        return write();
      }

      return check();
    });
};
