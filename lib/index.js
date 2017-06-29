'use strict';

/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */

const Sequelize = require('sequelize');
const $RefParser = require('json-schema-ref-parser');

const glob = require('glob');
const path = require('path');

// load after sequelize
const util = require('./util');

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

  // normalize given refs
  this.refs = {};

  if (Array.isArray(refs)) {
    refs.forEach(schema => {
      this.refs[schema.id] = schema;
    });
  } else {
    this.refs = refs || {};
  }

  // shared connection
  let conn;

  // store models from given dir
  const _defns = {};
  const _tasks = [];

  // identical setup as json-schema-faker
  const fixedRefs = {
    order: 300,
    canRead: true,
    read: (file, callback) =>
      callback(null, this.refs[file.url] || this.refs[path.relative(cwd, file.url)]),
  };

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
    get: () => _defns,
  });

  function applyRefs() {
    // apply relationships
    Object.keys(_defns).forEach(m => {
      util.makeRefs(_defns[m], _defns);
    });
  }

  // append model from settings
  this.add = model => {
    /* istanbul ignore else */
    if (!(model.$schema && model.$schema.id)) {
      throw new Error(`Invalid model, given '${JSON.stringify(model)}'`);
    }

    this.refs[model.$schema.id] = util.copy(model.$schema);

    /* istanbul ignore else */
    if (model.$schema.properties) {
      _tasks.push(() => $RefParser
        .dereference(cwd, util.copy(model.$schema), {
          resolve: { fixedRefs },
          dereference: {
            circular: 'ignore',
          },
        }).then(_schema => {
          _defns[_schema.id] = util.makeModel(_schema, model, conn);
        }));
    }

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
          ? cb(modelDefinition)
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

  // add connection to pool
  this.connect = () => {
    if (conn) {
      return Promise.resolve(this);
    }

    return Promise.resolve()
      .then(() => {
        conn = new Sequelize(settings || {});

        return Promise.all(_tasks.map(cb => cb()));
      })
      .then(() => applyRefs())
      .then(() => this);
  };

  // migration helper
  this.migrate = dump =>
    this.connect()
      .then(() =>
        Promise.all(Object.keys(dump.definitions)
          .filter(model => _defns[model])
          .map(model => {
            const schema = util.copy(dump.definitions[model]);

            // copy for self-references
            schema.definitions = dump.definitions;

            return $RefParser
              .dereference(cwd, schema, {
                dereference: {
                  circular: 'ignore',
                },
              })
              .then(_schema => {
                const opts = _schema.options || {};

                delete _schema.definitions;
                delete _schema.options;

                _schema.id = model;

                // override previous definition
                _defns[model] = util.makeModel(_schema, opts, conn);
              });
          })))
      // re-apply relationships
      .then(() => applyRefs())
      .then(() => conn.sync())
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
    description: description || new Date().toISOString(),
    definitions: {},
  };

  Object.keys(definitions).forEach(definition => {
    Object.keys(definitions[definition].definitions).forEach(key => {
      schema.definitions[`${definition}_${key}`] = definitions[definition].definitions[key];
    });
  });

  models.forEach(m => {
    schema.definitions[m.name] = util.fixRefs(m.options.$schema);

    // FIXME: consider store more details?
    schema.definitions[m.name].options = {
      timestamps: m.options.timestamps,
      tableName: m.options.tableName,
      paranoid: m.options.paranoid,
    };
  });

  return schema;
};

// abstract crud-builder
JSONSchemaSequelizer.resource = require('./res');

// common tasks
JSONSchemaSequelizer.syncAll = require('./sync');
JSONSchemaSequelizer.deleteAll = require('./delete');

module.exports = JSONSchemaSequelizer;
