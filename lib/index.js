'use strict';

/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */

const Sequelize = require('sequelize');
const $RefParser = require('json-schema-ref-parser');

const glob = require('glob');
const path = require('path');

// load after sequelize
const util = require('./util');
const diff = require('./diff');

function JSONSchemaSequelizer(settings, refs, cwd) {
  /* istanbul ignore else */
  if (!(this instanceof JSONSchemaSequelizer)) {
    return new JSONSchemaSequelizer(settings, refs, cwd);
  }

  /* istanbul ignore else */
  if (typeof refs === 'string') {
    cwd = refs;
    refs = {};
  }

  // normalize basedir
  cwd = `${(cwd || process.cwd()).replace(/\/+$/, '')}/`;

  // store given refs
  const _defns = {};

  /* istanbul ignore else */
  if (Array.isArray(refs)) {
    refs.forEach($schema => {
      _defns[$schema.id] = { $schema };
    });
  } else {
    Object.keys(refs || {}).forEach(k => {
      _defns[refs[k].id || k] = { $schema: refs[k] };
    });
  }

  // identical setup as json-schema-faker
  const fixedRefs = {
    order: 300,
    canRead: true,
    read: (file, callback) =>
      callback(null, util.copy((_defns[file.url]
        || _defns[path.relative(cwd, file.url)]).$schema)),
  };

  const fixedOpts = {
    resolve: { fixedRefs },
    dereference: {
      circular: 'ignore',
    },
  };

  // shared connection
  let conn;

  // export connection
  Object.defineProperty(this, 'sequelize', {
    configurable: false,
    enumerable: true,
    get: () => conn,
  });

  // export models
  Object.defineProperty(this, 'models', {
    configurable: false,
    enumerable: true,
    get: () => conn.models,
  });

  // export refs
  Object.defineProperty(this, 'refs', {
    configurable: false,
    enumerable: true,
    get: () => _defns,
  });

  // append model from settings
  this.add = model => {
    /* istanbul ignore else */
    if (!(model.$schema && model.$schema.id)) {
      throw new Error(`Invalid model, given '${JSON.stringify(model)}'`);
    }

    /* istanbul ignore else */
    if (_defns[model.$schema.id]) {
      throw new Error(`${model.$schema.id} model already defined`);
    }

    _defns[model.$schema.id] = util.copy(model);

    return this;
  };

  // append model from filesystem
  this.scan = cb => {
    glob.sync('**/*.{js,json}', { cwd, nodir: true }).forEach(model => {
      const name = path.basename(model).replace(/\.\w+$/, '');

      /* istanbul ignore else */
      if (!(name === 'index' || /^[A-Z]/.test(name)) && /\.js$/.test(model)) {
        return;
      }

      let modelDefinition;

      try {
        modelDefinition = require(path.join(cwd, model));
      } catch (e) {
        throw new Error(`Invalid model '${model}' definition. ${e.message}`);
      }

      const modelName = model
        .replace(/\/?(index\.js(?:on)?)$/, '')
        .replace(/\.\w+$/, '')
        .replace(/\/+/g, '');

      // unwrap definition
      if (model.indexOf('.json') > -1) {
        modelDefinition = { $schema: modelDefinition };
      } else {
        modelDefinition = typeof cb === 'function'
          ? cb(modelDefinition, modelName)
          : modelDefinition;
      }

      /* istanbul ignore else */
      if (!modelDefinition.$schema) {
        return;
      }

      /* istanbul ignore else */
      if (!modelDefinition.$schema.id) {
        modelDefinition.$schema.id = modelName;
      }

      this.add(modelDefinition);
    });

    return this;
  };

  // synchronize models
  this.sync = opts =>
    this.connect()
      .then(() => conn.sync(opts))
      .then(() => this);

  // close connection
  this.close = () =>
    this.connect()
      .then(() => conn.close())
      .then(() => this);

  // initialize refs
  this.hydrate = bundle =>
    this.connect()
      .then(() => {
        const _models = {};

        Object.keys(bundle).forEach(ref => {
          /* istanbul ignore else */
          if (bundle[ref].properties) {
            _models[ref] = util.makeModel(ref, conn, _defns[ref], bundle[ref]);

            // override instance $schema
            _models[ref].options.$schema = bundle[ref];
          }
        });

        // apply relationships
        util.makeRefs(_models, _defns);
      })
      .then(() => this);

  // add connection to pool
  this.connect = () => {
    /* istanbul ignore else */
    if (conn) {
      return Promise.resolve(this);
    }

    return Promise.resolve()
      .then(() => {
        conn = new Sequelize(settings || {});

        const _refs = Object.keys(_defns).reduce((prev, cur) => {
          /* istanbul ignore else */
          if (_defns[cur].$schema.properties) {
            prev[cur] = util.copy(_defns[cur].$schema);
          }

          return prev;
        }, {});

        return new $RefParser()
          .dereference(cwd, _refs, fixedOpts)
          .then(_bundle => this.hydrate(_bundle));
      })
      .then(() => this);
  };

  // migration helper
  this.rehydrate = dump =>
    this.connect()
      .then(() => {
        if (!(dump && dump.definitions)) {
          throw new Error('Missing definitions to rehydrate');
        }

        Object.keys(dump.definitions).forEach(def => {
          /* istanbul ignore else */
          if (dump.definitions[def].properties) {
            dump.definitions[def].id = def;
          }
        });

        return new $RefParser()
          .dereference(cwd, dump, {
            dereference: {
              circular: 'ignore',
            },
          })
          .then(_bundle => this.hydrate(_bundle.definitions))
          .then(() => conn.sync());
      })
      .then(() => this);
}

// model-deps bundler
JSONSchemaSequelizer.bundle = (schemas, definitions, description) => {
  /* istanbul ignore else */
  if (typeof definitions === 'string') {
    description = definitions;
    definitions = {};
  }

  const dump = {
    description: description || 'latest',
    definitions: {},
  };

  dump.description += ` (${new Date().toISOString()})`;

  Object.keys(definitions || {}).forEach(def => {
    dump.definitions[def] = definitions[def].definitions;
  });

  schemas.forEach(x => {
    dump.definitions[x.id] = util.fixRefs(x);
  });

  return dump;
};

// build code for migrations
JSONSchemaSequelizer.generate = (dump, defns, models, squash) => {
  if (dump && dump.definitions) {
    Object.keys(dump.definitions).forEach(def => {
      /* istanbul ignore else */
      if (dump.definitions[def].properties) {
        dump.definitions[def].id = def;
      }
    });
  }

  return Promise.resolve()
    .then(() => new $RefParser()
      .dereference(dump || {}, {
        dereference: {
          circular: 'ignore',
        },
      }))
    .then(_bundle => {
      const _defns = _bundle.definitions || {};
      const _result = squash ? [] : {};

      return util
        .sortModels(defns)
        .reduce((prev, cur) =>
          prev.then(() => {
            const ref = cur.options.$schema.id;

            const a = util.fixRefs(_defns[ref] || {}, true);
            const b = util.fixRefs(cur.options.$schema, true);

            const code = diff.build(ref, models, a, b, diff.map(a, b), squash);

            if (typeof code !== 'string') {
              Object.keys(code).forEach(key => {
                _result[key] = _result[key] || [];
                Array.prototype.push.apply(_result[key], code[key]);
              });
              return;
            }

            /* istanbul ignore else */
            if (code) {
              _result.push({ code, model: cur });
            }
          }), Promise.resolve())
        .then(() => {
          /* istanbul ignore else */
          if (squash) {
            return [
              "'use strict';\n/* eslint-disable */\nmodule.exports = {",
              `  up: [\n${_result.up.length ? `${_result.up.join('\n')}\n` : ''}  ],`,
              `  down: [\n${_result.down.length ? `${_result.down.join('\n')}\n` : ''}  ],`,
              `  change: [\n${_result.change.length ? `${_result.change.join('\n')}\n` : ''}  ],`,
              '};\n',
            ].join('\n');
          }

          return _result;
        });
    });
};

// abstract crud-builder
JSONSchemaSequelizer.resource = require('./res');

// migration helpers
JSONSchemaSequelizer.migrate = require('./umzug');

// common tasks
JSONSchemaSequelizer.syncAll = (deps, params) =>
  util
    .sortModels(deps)
    .reduce((prev, cur) =>
      prev.then(() => cur.sync(params))
    , Promise.resolve());

JSONSchemaSequelizer.deleteAll = (deps, params, options) =>
  Promise.all(deps.map(model => model.destroy({
    truncate: params.truncate === true,
    where: options && Object.keys(options).length
      ? options
      : null,
  })));

module.exports = JSONSchemaSequelizer;
