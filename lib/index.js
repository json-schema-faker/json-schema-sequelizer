'use strict';

/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */

const glob = require('glob');
const path = require('path');

const util = require('./util');

const Sequelize = require('sequelize');
const $RefParser = require('json-schema-ref-parser');

module.exports = function JSONSchemaSequelizer(settings, refs, cwd) {
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
  const _defns = this.models = {};
  const _tasks = [];

  // lazy load
  const fakeSchema = require('./fake');
  const schemaTypes = require('./types');

  // identical setup as json-schema-faker
  const fixedRefs = {
    order: 300,
    canRead: true,
    read: (file, callback) =>
      callback(null, this.refs[file.url] || this.refs[path.relative(cwd, file.url)]),
  };

  function makeModel($schema, model) {
    // TODO: oneOf support?
    const _modelName = util.id($schema.id);
    const _schema = schemaTypes.cleanSchema($schema);
    const _types = schemaTypes.convertSchema($schema);

    const _model = conn.define(_modelName, _types.props, model);

    /* istanbul ignore else */
    if (model.instanceMethods) {
      util.merge(_model.prototype, model.instanceMethods);
    }

    /* istanbul ignore else */
    if (model.classMethods) {
      util.merge(_model, model.classMethods);
    }

    _model.faked = fakeSchema(_schema);
    _model.refs = {};

    _types.refs.forEach(ref => {
      _model.refs[ref.params.as] = ref;
    });

    return _model;
  }

  function makeRefs(model) {
    Object.keys(model.refs).forEach(b => {
      b = model.refs[b];

      /* istanbul ignore else */
      if (typeof b.params.through === 'string' && _defns[b.params.through]) {
        b.params.through = _defns[b.params.through];
      }

      /* istanbul ignore else */
      if (typeof b.params.through === 'object'
        && typeof b.params.through.model === 'string' && _defns[b.params.through.model]) {
        b.params.through.model = _defns[b.params.through.model];
      }

      model.refs[b.params.as] = model[b.method](_defns[b.target], b.params);
    });
  }

  // append model from settings
  this.add = (schema, model) => {
    /* istanbul ignore else */
    if (!schema.id) {
      throw new Error(`Missing id for schema '${JSON.stringify(schema)}'`);
    }

    this.refs[schema.id] = util.copy(schema);

    _tasks.push(() => $RefParser
      .dereference(cwd, schema, {
        resolve: { fixedRefs },
        dereference: {
          circular: 'ignore',
        },
      }).then(_schema => {
        _defns[_schema.id] = makeModel(_schema, model || {});
      }));

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

      const schemaDefinition = modelDefinition.$schema;

      /* istanbul ignore else */
      if (!schemaDefinition.id) {
        schemaDefinition.id = model
          .replace(/(?:index)?\.js(?:on)?$/, '')
          .replace(/\/+/g, '');
      }

      this.add(schemaDefinition, modelDefinition);
    });

    return this;
  };

  // syncronize all models
  this.sync = opts =>
    this.connect()
      .then(() => conn.sync(opts));

  // close current connection
  this.close = () =>
    this.connect()
      .then(() => conn.close());

  // add connection to pool
  this.connect = () => {
    if (conn) {
      return Promise.resolve(conn);
    }

    return Promise.resolve()
      .then(() => {
        conn = new Sequelize(settings || {});

        return Promise.all(_tasks.map(cb => cb()));
      })
      .then(() => {
        // apply relationships
        Object.keys(_defns).forEach(m => {
          makeRefs(_defns[m]);
        });

        return conn;
      });
  };
};
