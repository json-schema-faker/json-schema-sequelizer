'use strict';

/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */

const Sequelize = require('sequelize');
const $RefParser = require('json-schema-ref-parser');

const glob = require('glob');
const path = require('path');

// load after sequelize
const util = require('./util');
const types = require('./types');

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
        .dereference(cwd, model.$schema, {
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
      .then(() => {
        // apply relationships
        Object.keys(_defns).forEach(m => {
          util.makeRefs(_defns[m], _defns);
        });

        return this;
      });
  };

  // migration helper
  this.migrate = dump =>
    this.connect()
      .then(() =>
        Promise.all(Object.keys(dump.definitions).map(model =>
          conn.define(model, types.convertSchema(dump.definitions[model]).props).sync({ force: true }))))
      .then(() => this);
}

// model-deps bundler
JSONSchemaSequelizer.bundle = (deps, description) => {
  const schema = {
    description: description || new Date().toISOString(),
    definitions: {},
  };

  deps.forEach(m => {
    schema.definitions[m.name] = util.fixRefs(m.options.$schema);
  });

  return schema;
};

// abstract crud-builder
JSONSchemaSequelizer.resource = require('./res');

// common tasks
JSONSchemaSequelizer.syncAll = require('./sync');
JSONSchemaSequelizer.deleteAll = require('./delete');

module.exports = JSONSchemaSequelizer;
