'use strict';

/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */

const glob = require('glob');
const path = require('path');

const util = require('./util');

module.exports = function JSONSchemaSequelizer(sequelize, refs, cwd, $) {
  /* istanbul ignore else */
  if (!(this instanceof JSONSchemaSequelizer)) {
    return new JSONSchemaSequelizer(sequelize, refs, cwd);
  }

  /* istanbul ignore else */
  if (typeof refs === 'string') {
    $ = cwd;
    cwd = refs;
    refs = {};
  }

  // normalize basedir
  cwd = `${(cwd || process.cwd()).replace(/\/+$/, '')}/`;

  // normalize given refs
  let $refs = {};

  if (Array.isArray(refs)) {
    refs.forEach(schema => {
      $refs[schema.id] = schema;
    });
  } else {
    $refs = refs || {};
  }

  // store models from given dir
  const _defns = {};
  const _models = [];

  // lazy load
  const fakeSchema = require('./fake');
  const schemaTypes = require('./types');

  function makeModel($schema, model) {
    // TODO: oneOf support?
    const _modelName = util.id($schema.id);
    const _schema = schemaTypes.cleanSchema($schema);
    const _types = schemaTypes.convertSchema($schema);

    const _model = sequelize.define(_modelName, _types.props, model);

    /* istanbul ignore else */
    if (model.instanceMethods) {
      util.merge(_model.prototype, model.instanceMethods);
    }

    /* istanbul ignore else */
    if (model.classMethods) {
      util.merge(_model, model.classMethods);
    }

    _model.definition = { $schema: _schema };
    _model.faked = fakeSchema(_schema);
    _model.refs = {};

    _types.refs.forEach(ref => {
      _model.refs[ref.params.as] = ref;
    });

    // merge other special-$props
    Object.keys(model).forEach(key => {
      if (key.charAt() === '$' && typeof _model.definition[key] === 'undefined') {
        _model.definition[key] = model[key];
      }
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

  glob.sync('**/*.{js,json}', { cwd, nodir: true }).forEach(model => {
    let modelDefinition = require(path.join(cwd, model));

    /* istanbul ignore else */
    if (model.indexOf('.json') > -1) {
      modelDefinition = { $schema: modelDefinition };
    }

    /* istanbul ignore else */
    if (typeof modelDefinition === 'function') {
      modelDefinition = modelDefinition($);
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

    /* istanbul ignore else */
    if (!$refs[schemaDefinition.id]) {
      $refs[schemaDefinition.id] = schemaDefinition;
    }

    /* istanbul ignore else */
    if (schemaDefinition.properties) {
      _models.push({
        model: modelDefinition,
        schema: schemaDefinition,
      });
    }
  });

  // identical setup as json-schema-faker
  const fixedRefs = {
    order: 300,
    canRead: true,
    read(file, callback) {
      callback(null, $refs[file.url] || $refs[file.url.split('/').pop()]);
    },
  };

  // close current connection
  Object.defineProperty(_defns, 'refs', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: $refs,
  });

  // syncronize all models
  Object.defineProperty(_defns, 'sync', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: opts => sequelize.sync(opts),
  });

  // close current connection
  Object.defineProperty(_defns, 'close', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: () => sequelize.close(),
  });

  const $RefParser = require('json-schema-ref-parser');

  return Promise.all(_models.map(def =>
    $RefParser.dereference(cwd, def.schema, {
      resolve: { fixedRefs },
      dereference: {
        circular: 'ignore',
      },
    }).then(_schema => {
      _defns[_schema.id] = makeModel(_schema, def.model);
    })))
  .then(() => {
    // apply relationships
    Object.keys(_defns).forEach(m => {
      makeRefs(_defns[m]);
    });
  })
  .then(() => _defns);
};
