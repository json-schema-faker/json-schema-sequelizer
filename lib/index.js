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
  const obj = {};

  METHODS.concat(PROPERTIES).forEach((key) => {
    obj[key] = schema[key] && id(schema.$ref);
  });

  obj.as = property;

  return obj;
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

  // getter
  function F() {
    return F.model;
  }

  F.model = sequelize.define(key(_modelName), _types, props);
  F.fake = fakeSchema(_resolvedSchema, refs);

  return F;
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
      const o = {};

      PROPERTIES.forEach((_prop) => {
        if (b[_prop]) {
          o[_prop] = b[_prop];
        }
      });

      METHODS.forEach((_method) => {
        if (b[_method]) {
          if (typeof models[a][o.as] !== 'undefined') {
            throw new Error(`Relation '${a}.${o.as}' is already defined`);
          }

          if (typeof o.through === 'string' && models[o.through]) {
            o.through = models[o.through].model;
          }

          if (typeof o.through === 'object' && typeof o.through.model === 'string' && models[o.through.model]) {
            o.through = models[o.through.model].model;
          }

          models[a][o.as] = models[a].model[_method](models[b[_method]].model, o);
        }
      });
    });
  });

  return models;
};
