'use strict';

/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */

const $RefParser = require('json-schema-ref-parser');
const glob = require('glob');
const path = require('path');

const util = require('./util');

const fakeSchema = require('./fake');
const schemaTypes = require('./types');

function makeModel(sequelize, $schema, model) {
  // TODO: oneOf support?
  const _modelName = util.id($schema.id);
  const _schema = schemaTypes.cleanSchema($schema);
  const _types = schemaTypes.convertSchema($schema);
  const _model = sequelize.define(_modelName, _types.props, model);

  _model.definition = { $schema: _schema };
  _model.faked = fakeSchema(_schema);
  _model.refs = _types.refs;

  // merge other special-$props
  Object.keys(model).forEach(key => {
    if (key.charAt() === '$' && typeof _model.definition[key] === 'undefined') {
      _model.definition[key] = model[key];
    }
  });

  return _model;
}

module.exports = function JSONSchemaSequelizer(sequelize, refs, cwd) {
  if (!(this instanceof JSONSchemaSequelizer)) {
    return new JSONSchemaSequelizer(sequelize, refs, cwd);
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

  // list models from given dir
  const _defns = {};
  const _models = [];

  glob.sync('**/*.{js,json}', { cwd, nodir: true }).forEach(model => {
    const modelDefinition = require(path.join(cwd, model));

    /* istanbul ignore else */
    if (typeof modelDefinition.id === 'string' && modelDefinition.definitions) {
      $refs[modelDefinition.id] = modelDefinition;
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

    /* istanbul ignore else */
    if (!$refs[modelDefinition.$schema.id]) {
      $refs[modelDefinition.$schema.id] = util.merge({}, modelDefinition.$schema);
    }

    _models.push(modelDefinition);
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
    value: () => $refs,
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

  return Promise.all(_models.map(model => {
    const definition = util.merge({}, model);
    const schema = definition.$schema;

    delete definition.$schema;

    return $RefParser.dereference(cwd, schema, {
      resolve: { fixedRefs },
    }).then(_schema => {
      _defns[_schema.id] = makeModel(sequelize, _schema, model);
    });
  }))
  .then(() => {
    // apply relationships
    Object.keys(_defns).forEach(m => {
      (_defns[m].refs || []).forEach(b => {
        /* istanbul ignore else */
        if (typeof b.params.through === 'string' && _defns[b.params.through]) {
          b.params.through = _defns[b.params.through];
        }

        /* istanbul ignore else */
        if (typeof b.params.through === 'object'
          && typeof b.params.through.model === 'string' && _defns[b.params.through.model]) {
          b.params.through.model = _defns[b.params.through.model];
        }

        _defns[m].refs[b.params.as] = _defns[m][b.method](sequelize.model(b.target), b.params);
      });
    });
  })
  .then(() => _defns);
};
