const deref = require('deref');

const fakeSchema = require('./fake');
const schemaTypes = require('./types');

const METHODS = ['hasOne', 'hasMany', 'belongsTo', 'belongsToMany'];
const PROPERTIES = ['sourceKey', 'targetKey', 'foreignKey', 'otherKey', 'constraints', 'scope', 'through', 'as'];

function id(ref) {
  return ref.match(/\/?([^\/#]+)#?$/)[1];
}

function key(name) {
  return name
    .replace(/[A-Z]/g, $0 => `_${$0}`)
    .replace(/^_/, '')
    .toLowerCase();
}

// reducing code is borrowed from json-schema-faker
function isKey(prop) {
  return prop === 'enum' || prop === 'default' || prop === 'required' || prop === 'definitions';
}

function clone(arr) {
  const out = [];

  arr.forEach((item, index) => {
    if (typeof item === 'object' && item !== null) {
      out[index] = Array.isArray(item) ? clone(item) : merge({}, item);
    } else {
      out[index] = item;
    }
  });

  return out;
}

function merge(a, b) {
  for (var key in b) {
    if (typeof b[key] !== 'object' || b[key] === null) {
      a[key] = b[key];
    } else if (Array.isArray(b[key])) {
      a[key] = (a[key] || []).concat(clone(b[key]));
    } else if (typeof a[key] !== 'object' || a[key] === null || Array.isArray(a[key])) {
      a[key] = merge({}, b[key]);
    } else {
      a[key] = merge(a[key], b[key]);
    }
  }

  return a;
}

function getRefs(schema, property) {
  const _params = {};

  let _method;
  let _obj;

  for (let i = 0, c = METHODS.length; i < c; i += 1) {
    if (schema[METHODS[i]]) {
      _method = METHODS[i];
      _obj = schema[METHODS[i]];
      break;
    }
  }

  if (typeof _obj === 'object') {
    PROPERTIES.forEach((prop) => {
      if (_obj[prop]) {
        _params[prop] = _obj[prop];
      }
    });
  }

  _params.as = property;

  return {
    target: id(schema.$ref),
    method: _method,
    params: _params,
  };
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

      rel[$schema.id].push(getRefs(sub, prop));

      return;
    }

    if (Array.isArray(sub.allOf)) {
      const schemas = sub.allOf;

      delete sub.allOf;

      schemas.forEach((schema) => {
        merge(sub, reduce(schema));
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

  const _resolvedSchema = $($schema, refs, true);
  const _fixedSchema = $($schema, refs);
  const _modelName = id($schema.id);

  const _schema = schemaTypes.cleanSchema(_fixedSchema);
  const _types = schemaTypes.convertSchema(_fixedSchema, reduce);
  const _model = sequelize.define(key(_modelName), _types, props);

  _model.fake = fakeSchema(_resolvedSchema, refs);
  _model.rel = {};

  return _model;
};

module.exports = (sequelize, defns, refs) => {
  const $ = deref();

  const rel = {};
  const models = {};

  defns.forEach((props) => {
    const schema = props.$schema;

    delete props.$schema;

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

      models[a].rel[b.params.as] = models[a][b.method](models[b.target], b.params);
    });
  });

  return models;
};
