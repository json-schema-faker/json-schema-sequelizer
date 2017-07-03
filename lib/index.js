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

      // unwrap definition
      if (model.indexOf('.json') > -1) {
        modelDefinition = { $schema: modelDefinition };
      } else {
        modelDefinition = typeof cb === 'function'
          ? cb(modelDefinition, model)
          : modelDefinition;
      }

      /* istanbul ignore else */
      if (!modelDefinition.$schema) {
        return;
      }

      /* istanbul ignore else */
      if (!modelDefinition.$schema.id) {
        modelDefinition.$schema.id = model
          .replace(/(?:index)?\.js(?:on)?$/, '')
          .replace(/\/+/g, '');
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
        util.makeRefs(_models);
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
JSONSchemaSequelizer.bundle = (models, definitions, description) => {
  /* istanbul ignore else */
  if (typeof definitions === 'string') {
    description = definitions;
    definitions = {};
  }

  const schema = {
    description: description || 'latest',
    definitions: {},
  };

  schema.description += ` (${new Date().toISOString()})`;

  Object.keys(definitions || {}).forEach(def => {
    schema.definitions[def] = definitions[def].definitions;
  });

  models.forEach(m => {
    schema.definitions[m.id] = m;
  });

  return util.fixRefs(schema);
};

// build code for migrations
JSONSchemaSequelizer.generate = (dump, defns, models) => {
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
      const _external = {};
      const _result = [];

      return util
        .sortModels(defns.map(model => {
          // preconditions
          Object.keys(model.associations).forEach(ref => {
            const assoc = model.associations[ref];
            const id = assoc.target.name;

            /* istanbul ignore else */
            if (!assoc.isSingleAssociation) {
              _external[id] = _external[id] || {};
              _external[id][assoc.foreignKey] = {
                type: assoc.target.attributes[assoc.foreignKey].type.toString(),
                refs: ((_external[id][assoc.foreignKey] || {}).refs || []).concat(model.name),
              };
            }
          });

          return model;
        }))
        .reduce((prev, cur) =>
          prev.then(() => {
            const ref = cur.options.$schema.id;

            const a = util.fixRefs((_bundle.definitions && _bundle.definitions[ref]) || {}, true);
            const b = util.fixRefs(cur.options.$schema, true);

            /* istanbul ignore else */
            if (_external[ref]) {
              Object.keys(_external[ref]).forEach(k => {
                b.properties[k] = {
                  $ref: true,
                  $type: _external[ref][k].type,
                  $refs: _external[ref][k].refs,
                };
              });
            }

            const c = diff.map(a, b);

            const code = diff.build(ref, models, a, b, c);

            /* istanbul ignore else */
            if (code) {
              _result.push({ code, model: cur });
            }
          }), Promise.resolve())
        .then(() => _result);
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
