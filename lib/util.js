'use strict';

const _util = require('sequelize/lib/utils');

const _noop = () => {};

let schemaTypes;

const METHODS = ['hasOne', 'hasMany', 'belongsTo', 'belongsToMany'];
const PROPERTIES = ['sourceKey', 'targetKey', 'foreignKey', 'otherKey', 'constraints', 'scope', 'through', 'as'];

const DEFINITIONS = {
  string: definition => {
    switch (definition.format || definition.value) {
      case 'date-time': return ['DATE'];
      case 'datetime': return ['DATE'];
      case 'date': return ['DATEONLY'];
      case 'time': return ['TIME'];
      case 'now': return ['NOW'];

      case 'json': return ['JSON'];
      case 'jsonb': return ['JSONB'];
      case 'blob': return ['BLOB', definition];

      case 'uuid':
      case 'uuidv4':
        return ['UUIDV4'];

      case 'uuidv1': return ['UUIDV1'];

      case 'char': return ['CHAR', definition];
      case 'text': return ['TEXT'];
      case 'citext': return ['CITEXT'];

      case 'int64':
      case 'bigint':
        return ['BIGINT', definition];

      case 'int32': return ['STRING', definition];

      case 'number':
        return ['DECIMAL', definition];

      case 'real':
      case 'float':
      case 'double':
      case 'boolean':
      case 'decimal':
        return [definition.format.toUpperCase(), definition];

      default:
        return ['STRING', definition];
    }
  },

  null: () => ['VIRTUAL'],
  boolean: () => ['BOOLEAN'],

  number: definition => ['DECIMAL', definition],
  integer: definition => ['INTEGER', definition],

  // postgres only
  array: definition => {
    /* istanbul ignore else */
    if (!definition.items
      || !definition.items.type
      || !DEFINITIONS[definition.items.type]) {
      throw new Error(`Invalid definition for '${JSON.stringify(definition)}'`);
    }

    return ['ARRAY', [DEFINITIONS[definition.items.type], definition.items]];
  },
  object: definition => [definition.binary ? 'JSONB' : 'JSON'],

  // these types cannot be used as, e.g. { "type": "virtual" }
  // because thet are not valid types, instead use:
  // { "type": "number", "virtual": true }
  // { "type": "object", "hstore": true }
  // { "type": "string", "range": true }
  // etc.

  range: () => ['RANGE'],
  hstore: () => ['HSTORE'],
  geometry: () => ['GEOMETRY'],
  geography: () => ['GEOGRAPHY'],

  // virtual types
  virtual: definition => {
    /* istanbul ignore else */
    if (!definition.return) {
      return ['VIRTUAL'];
    }

    /* istanbul ignore else */
    if (!DEFINITIONS[definition.return]) {
      throw new Error(`Unknown definition '${definition.return}'`);
    }

    return ['VIRTUAL', [DEFINITIONS[definition.return], definition], definition.fields || []];
  },
};

function id(ref) {
  return ref.match(/\/?([^/#]+)#?$/)[1];
}

function copy(obj) {
  /* istanbul ignore else */
  if (obj && typeof obj === 'object') {
    /* istanbul ignore else */
    if (Array.isArray(obj)) {
      return obj.map(copy);
    }

    const clone = {};

    Object.keys(obj).forEach(key => {
      clone[key] = copy(obj[key]);
    });

    return clone;
  }

  return obj;
}

function merge(a) {
  Array.prototype.slice.call(arguments, 1)
    .forEach(b => {
      /* istanbul ignore else */
      if (b) {
        Object.keys(b).forEach(key => {
          /* istanbul ignore else */
          if (typeof a[key] === 'undefined') {
            a[key] = b[key];
          }
        });
      }
    });

  return a;
}

function reduceRefs(definition) {
  /* istanbul ignore else */
  if (Array.isArray(definition.allOf)) {
    const schemas = definition.allOf;

    delete definition.allOf;

    schemas.forEach(_definition => {
      merge(definition, reduceRefs(_definition));
    });
  }

  return definition;
}

function fixRefs(schema, refs) {
  /* istanbul ignore else */
  if (refs) {
    reduceRefs(schema);
  }

  /* istanbul ignore else */
  if (schema && typeof schema === 'object') {
    /* istanbul ignore else */
    if (Array.isArray(schema)) {
      return schema.map(x => fixRefs(x, refs));
    }

    /* istanbul ignore else */
    if (typeof schema.$ref === 'string' && schema.$ref.indexOf('#/definitions') !== 0) {
      schema.$ref = schema.$ref.indexOf('#/definitions') > -1
        ? `#/definitions/${schema.$ref.split('#/definitions/').join('/')}`
        : `#/definitions/${schema.$ref}`;
    }

    Object.keys(schema).forEach(key => {
      /* istanbul ignore else */
      if (refs && typeof schema[key].id === 'string') {
        schema[key] = { $ref: schema[key].id };
      } else {
        schema[key] = fixRefs(schema[key], refs);
      }
    });

    /* istanbul ignore else */
    if (!refs && typeof schema.id === 'string') {
      delete schema.id;
    }
  }

  return schema;
}

function getRefs(schema, type, key) {
  const _params = {};

  let _method;
  let _obj;

  for (let i = 0, c = METHODS.length; i < c; i += 1) {
    /* istanbul ignore else */
    if (schema[METHODS[i]]) {
      _method = METHODS[i];
      _obj = schema[METHODS[i]];
      break;
    }
  }

  PROPERTIES.forEach(prop => {
    const value = (_obj && _obj[prop]) || schema[prop];

    /* istanbul ignore else */
    if (value) {
      _params[prop] = value;
    }
  });

  _params.as = _params.as || key;

  return {
    target: id(schema.id || schema.$ref),
    method: _method || type,
    params: _params,
  };
}

// FIXME: accept args?
function Model() {}

// default methods
Model.destroy = _noop;
Model.create = _noop;
Model.update = _noop;
Model.findOne = _noop;
Model.findAll = _noop;
Model.runHooks = _noop;

function makeModel(ref, conn, defns, schemas) {
  const schema = copy(schemas[ref]);

  // FIXME: avoid circular dependency
  schemaTypes = schemaTypes || require('./types');

  // TODO: oneOf support?
  const _schema = schemaTypes.cleanSchema(schema);
  const _types = schemaTypes.convertSchema(schema, schema.virtual);
  const _refs = {};

  /* istanbul ignore else */
  if (_types.refs) {
    _types.refs.forEach(_ref => {
      _refs[_ref.params.as] = _ref;
    });
  }

  _schema.definitions = _schema.definitions || {};

  // normalize and clean references
  Object.keys(schemas).forEach(k => {
    const sub = schemaTypes.cleanSchema(schemas[k]);

    /* istanbul ignore else */
    if (sub.definitions) {
      merge(sub, sub.definitions);
      delete sub.definitions;
    }

    /* istanbul ignore else */
    if (Object.keys(sub).length) {
      _schema.definitions[k] = sub;
    }
  });

  const model = copy(defns[ref]);

  let _model;

  if (schema.virtual === true) {
    // mock Sequelize model
    _model = Object.create(Model.prototype);
    _model.virtual = true;

    // fallback
    _model._hasPrimaryKeys = false;
    _model.primaryKeyAttribute = null;

    // override
    Object.keys(schema.properties || {}).forEach(key => {
      if (schema.properties[key].primaryKey === true) {
        _model.primaryKeyAttribute = key;
        _model._hasPrimaryKeys = true;
      }
    });

    _model.associations = {};
    _model.attributes = {};
    _model.tableName = ref;
    _model.name = ref;
    _model.refs = {};

    _model.options = model;
    _model.options.name = {
      model: ref,
      plural: _util.pluralize(ref),
      singular: _util.singularize(ref),
    };
  } else {
    // avoid overloading original definition
    _model = conn.define(ref, _types.props, merge(model, schema.options));

    // store connection identifier
    _model.database = conn.options.identifier;
  }

  // overrides
  merge(_model.prototype, model.instanceMethods);
  merge(_model, model.classMethods);

  return {
    model: _model,
    refs: _refs,
  };
}

function makeFK(properties, model, type) {
  const modelPK = model.primaryKeyAttribute;
  const modelProp = `${model.name}${modelPK[0].toUpperCase() + modelPK.substr(1)}`;

  /* istanbul ignore else */
  if (!properties[modelProp]) {
    properties[modelProp] = {
      type: model.options.$schema.properties[modelPK].type,
      references: {
        model: model.options.name.plural,
        key: modelPK,
      },
    };

    if (type === 'belongsToMany') {
      properties[modelProp].primaryKey = true;
      properties[modelProp].onDelete = 'CASCADE';
      properties[modelProp].onUpdate = 'CASCADE';
    } else {
      properties[modelProp].onDelete = type === 'belongsTo' ? 'NO ACTION' : 'CASCADE';
      properties[modelProp].onUpdate = 'CASCADE';

      /* istanbul ignore else */
      if (model.options.$schema.properties[modelPK].allowNull) {
        properties[modelProp].onDelete = 'SET NULL';
      }
    }
  }
}

function makeRefs(models, defns, conn) {
  Object.keys(models).map(model => {
    const a = models[model];

    /* istanbul ignore else */
    if (a.model.virtual === true) {
      return null;
    }

    Object.keys(a.refs).forEach(prop => {
      const b = a.refs[prop];

      /* istanbul ignore else */
      if (models[b.target].model.virtual !== true) {
        a.model[b.method](models[b.target].model, copy(b.params));

        /* istanbul ignore else */
        if (b.params.through) {
          if (!(models[b.params.through] || defns[b.params.through])
            && b.target !== conn.models[b.params.through].options.$schema.id) {
            const properties = {};

            // build foreign-keys
            makeFK(properties, a.model, b.method);
            makeFK(properties, models[b.target].model, b.method);

            const $schema = {
              id: b.params.through,
              properties,
            };

            // store definition for reference
            defns[b.params.through] = { $schema };

            conn.models[b.params.through].options.$schema = $schema;
            conn.models[b.params.through].options.$references = {};
            conn.models[b.params.through].options.$dependencies = {};
          } else {
            // sync foreign-keys
            makeFK(defns[b.params.through].$schema.properties, a.model, b.method);
            makeFK(defns[b.params.through].$schema.properties, models[b.target].model, b.method);

            conn.models[b.params.through].options.$schema = defns[b.params.through].$schema;
          }

          conn.models[b.params.through].options._hasForeignKeys = 2;
        }

        if (b.params.foreignKey) {
          makeFK(defns[b.target].$schema.properties, a.model, b.method);
          makeFK(conn.models[b.target].options.$schema.properties, a.model, b.method);

          conn.models[b.target].options._hasForeignKeys = 1;
        }
      }
    });

    return a;
  })
    .filter(x => x)
    .forEach(a => {
      Object.keys(a.model.attributes).forEach(prop => {
        /* istanbul ignore else */
        if (a.model.attributes[prop].references) {
          const refs = a.model.attributes[prop].references;
          const type = a.model.attributes[prop].type;

          /* istanbul ignore else */
          if (!a.model.options.$schema.properties[prop]
            && !defns[a.model.name].$schema.properties[prop]
            && type.options.Model.options.$schema.properties[refs.key]) {
            // append associated refs
            a.model.options.$schema.properties[prop] =
            defns[a.model.name].$schema.properties[prop] = {
              type: type.options.Model.options.$schema.properties[refs.key].type,
            };
          }
        }
      });

      Object.keys(a.model.associations).forEach(prop => {
        const assoc = a.model.associations[prop];
        const fields = assoc.target.options.$schema.properties;

        // attach external references
        defns[a.model.name].$dependencies[prop].foreignKey = {
          prop: assoc.foreignKey,
          type: fields[assoc.target.primaryKeyAttribute].type,
        };
      });
    });
}

function sortModels(deps) {
  const tree = {};
  const map = {};
  const out = [];

  deps.forEach(model => {
    map[model.name] = model;
    tree[model.name] = Object.keys(model.associations)
      .map(ref => model.associations[ref].target.name)
      .reduce((prev, cur) => {
        /* istanbul ignore else */
        if (prev.indexOf(cur) === -1) {
          prev.push(cur);
        }

        return prev;
      }, []);
  });

  Object.keys(tree).forEach(root => {
    if (!tree[root].length) {
      /* istanbul ignore else */
      if (out.indexOf(root) === -1) {
        out.unshift(root);
      }
    } else {
      /* istanbul ignore else */
      if (out.indexOf(root) === -1) {
        out.push(root);
      }

      tree[root].forEach(sub => {
        if (out.indexOf(sub) === -1) {
          out.unshift(sub);
        } else {
          out.splice(out.indexOf(root), 1);
          out.push(root);
        }
      });
    }
  });

  return out
    .map(x => map[x])
    .filter(x => x)
    .sort((a, b) => {
      /* istanbul ignore else */
      if (a.options._hasForeignKeys && b.options._hasForeignKeys) {
        return a.options._hasForeignKeys - b.options._hasForeignKeys;
      }

      /* istanbul ignore else */
      if (a.options._hasForeignKeys) {
        return 1;
      }

      return 0;
    });
}

function getDefinition(definition, options, cb) {
  if (Array.isArray(definition.enum)) {
    return ['ENUM', definition];
  }

  const value = DEFINITIONS[definition.type];

  let result = value;

  if (options !== false && typeof value === 'function') {
    result = value(options || definition);
  }

  if (typeof cb === 'function') {
    return cb.apply(null, result);
  }

  return result;
}

module.exports = {
  id,
  copy,
  merge,
  fixRefs,
  getRefs,
  makeRefs,
  reduceRefs,
  makeModel,
  sortModels,
  getDefinition,
};
