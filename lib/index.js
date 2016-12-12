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
    if (sub.items && typeof sub.items.$ref === 'string') {
      sub = sub.items;
    }

    if (typeof sub.$ref === 'string') {
      if (!rel[$schema.id]) {
        rel[$schema.id] = [];
      }

      rel[$schema.id].push(util.getRefs(sub, prop));

      return;
    }

    if (Array.isArray(sub.allOf)) {
      const schemas = sub.allOf;

      delete sub.allOf;

      schemas.forEach((schema) => {
        util.merge(sub, reduce(schema));
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
  const _model = sequelize.define(util.key(_modelName), _types, props);

  _model.$schema = $schema;
  _model.refs = {};
  _model.fake = fakeSchema(_schema, refs);
  _model.with = (...props) => props.map(s => _model.refs[s]);

  return _model;
};

module.exports = (sequelize, defns, refs) => {
  const $ = deref();

  const rel = {};
  const models = {};

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
        b.params.through = models[b.params.through.model];
      }

      models[a].refs[b.params.as] = models[a][b.method](models[b.target], b.params);
    });
  });

  return models;
};
