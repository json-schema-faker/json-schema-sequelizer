'use strict';

const deref = require('deref');

const util = require('./util');

const fakeSchema = require('./fake');
const schemaTypes = require('./types');

// reducing code is borrowed from json-schema-faker
function isKey(prop) {
  return prop === 'enum' || prop === 'default' || prop === 'required' || prop === 'definitions';
}

function makeModel(sequelize, $schema, props, refs, rel, $) {
  function reduce(sub, prop) {
    let array;

    if (sub.items && typeof sub.items.$ref === 'string') {
      array = true;
      sub = sub.items;
    }

    if (typeof sub.$ref === 'string') {
      if (!rel[$schema.id]) {
        rel[$schema.id] = [];
      }

      const _opts = util.getRefs(sub);

      _opts.method = _opts.method
        || (array ? 'hasMany' : 'hasOne');

      _opts.params.as = prop;

      rel[$schema.id].push(_opts);

      return;
    }

    if (Array.isArray(sub.allOf)) {
      const schemas = sub.allOf;

      delete sub.allOf;

      schemas.forEach((_sub) => {
        util.merge(sub, reduce(_sub));
      });
    }

    for (var _prop in sub) {
      if ((Array.isArray(sub[_prop]) || typeof sub[_prop] === 'object') && !isKey(_prop)) {
        sub[_prop] = reduce(sub[_prop], _prop);
      }
    }

    return sub;
  }

  // TODO: oneOf support?

  const _fixedSchema = $($schema, refs);
  const _modelName = util.id($schema.id);

  const _schema = schemaTypes.cleanSchema(_fixedSchema);
  const _types = schemaTypes.convertSchema(_fixedSchema, reduce);
  const _model = sequelize.define(_modelName, _types, props);

  _model.$schema = $schema;
  _model.faked = fakeSchema(_schema, refs);
  _model.refs = {};

  return _model;
};

module.exports = function JSONSchemaSequelizer(sequelize, defns, refs) {
  if (!(this instanceof JSONSchemaSequelizer)) {
    return new JSONSchemaSequelizer(sequelize, defns, refs);
  }

  const $ = deref();

  const rel = {};
  const models = {};

  // given schemas are refs!
  Array.prototype.push.apply(refs, defns.map(props => props.$schema));

  defns.forEach((props) => {
    const definition = util.merge({}, props);
    const schema = definition.$schema;

    delete definition.$schema;

    if (!models[schema.id]) {
      models[schema.id] = makeModel(sequelize, schema, props, refs, rel, $);
    }
  });

  Object.keys(rel).forEach((a) => {
    rel[a].forEach((b) => {
      if (typeof b.params.through === 'string' && models[b.params.through]) {
        b.params.through = models[b.params.through];
      }

      if (typeof b.params.through === 'object' && typeof b.params.through.model === 'string' && models[b.params.through.model]) {
        b.params.through.model = models[b.params.through.model];
      }

      models[a].refs[b.params.as] = models[a][b.method](models[b.target], b.params);
    });
  });

  models.sync = () => sequelize.sync();

  return models;
};
