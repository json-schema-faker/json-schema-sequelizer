'use strict';

const _util = require('sequelize/lib/utils');

const _invoke = typeName => definition => [typeName.toUpperCase()]
  .concat(typeof definition[typeName] !== 'boolean'
    ? definition[typeName]
    : []);

const _noop = () => {};

let schemaTypes;

const METHODS = ['hasOne', 'hasMany', 'belongsTo', 'belongsToMany'];
const PROPERTIES = ['sourceKey', 'targetKey', 'foreignKey', 'otherKey', 'constraints', 'scope', 'through', 'as'];
const ALLOWED_PROPS = ['items', 'properties', 'options', 'required', 'type', 'id'];

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

  range: _invoke('range'),
  hstore: _invoke('hstore'),
  geometry: _invoke('geometry'),
  geography: _invoke('geography'),

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

function copy(obj, cb) {
  /* istanbul ignore else */
  if (obj && typeof obj === 'object') {
    /* istanbul ignore else */
    if (Array.isArray(obj)) {
      return obj.map(x => copy(x, cb));
    }

    const clone = {};

    Object.keys(obj).forEach(key => {
      const value = obj[key];
      const items = value && value.items;

      clone[key] = copy(value, cb);

      /* istanbul ignore else */
      if (typeof cb === 'function' && (items && (items.$ref || items.id))) {
        cb(clone[key]);
      }
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
      Object.keys(schema).forEach(prop => {
        if (ALLOWED_PROPS.indexOf(prop) === -1) {
          delete schema[prop];
        }
      });

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

function mixRefs(schema) {
  const items = schema.items;

  const fixedId = (['object', 'array'].indexOf(items.type) !== -1 && items.id)
    || items.type
    || items.$ref;

  const assoc = items.belongsToMany || items.hasMany;
  const schemaId = ((assoc && assoc.through) || assoc || {}).model || fixedId;

  const oldId = items.$ref;

  delete items.belongsToMany;
  delete items.hasMany;

  if (!oldId) {
    return;
  }

  if (schemaId !== fixedId) {
    delete items.$ref;

    items.id = schemaId;
    items.as = fixedId;
    items.allOf = [
      { $ref: schemaId },
      {
        type: 'object',
        properties: {
          [oldId]: {
            $ref: oldId,
          },
        },
        required: [oldId],
      },
    ];
  }
}

function snakeCase(value) {
  return _util.underscore(value);
}

function normalizeProp(prefix, suffix, underscored) {
  if (!underscored) {
    return (prefix || '') + suffix[0].toUpperCase() + suffix.substr(1);
  }

  if (!prefix) {
    return snakeCase(suffix);
  }

  return `${snakeCase(prefix)}_${snakeCase(suffix)}`;
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
  const _types = schemaTypes.convertSchema(schema, schema.virtual, conn);
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
    _model.rawAttributes = {};
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
    schema.options = schema.options || {};

    const isUnderscored = schema.options.underscored || (conn.options.define || {}).underscored;
    const freezeTableName = schema.options.freezeTableName || (conn.options.define || {}).freezeTableName;

    schema.options.tableName = schema.options.tableName
      || (freezeTableName && normalizeProp(null, ref, isUnderscored))
      || ref;

    /* istanbul ignore else */
    if (schema.options.tableName === ref) {
      delete schema.options.tableName;
    }

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

function makeRef(properties, prop, obj) {
  properties[prop].references = obj.references;
  properties[prop].onDelete = obj.onDelete;
  properties[prop].onUpdate = obj.onUpdate;
}

function makeFK(properties, model, type, sub) {
  Object.keys(model.primaryKeys).forEach(modelPK => {
    const modelName = normalizeProp(null, model.name, model.options.underscored);
    const modelProp = normalizeProp(model.name, modelPK, model.options.underscored);

    /* istanbul ignore else */
    if (!properties[modelProp]) {
      properties[modelProp] = {
        type: model.options.$schema.properties[modelPK].type,
        modelName: model.name,
        references: {
          model: !model.options.freezeTableName
            ? model.options.name.plural
            : modelName,
          key: modelPK,
        },
      };

      if (type === 'belongsToMany') {
        properties[modelProp].primaryKey = sub;
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
  });
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
          const through = typeof b.params.through === 'string'
            ? { model: b.params.through }
            : b.params.through;

          const _unique = through.unique !== false;
          const _options = conn.models[through.model].options;

          if (!(models[through.model] || defns[through.model])
            && b.target !== _options.$schema.id) {
            const properties = {};

            // build foreign-keys
            makeFK(properties, a.model, b.method, _unique);
            makeFK(properties, models[b.target].model, b.method, _unique);

            const $schema = {
              id: through.model,
              properties,
            };

            // store definition for reference
            defns[through.model] = { $schema };

            _options.$schema = $schema;
            _options.$references = {};
            _options.$dependencies = {};
          } else {
            // sync foreign-keys
            makeFK(_options.$schema.properties, a.model, b.method, _unique);
            makeFK(_options.$schema.properties, models[b.target].model, b.method, _unique);

            makeFK(defns[through.model].$schema.properties, a.model, b.method, _unique);
            makeFK(defns[through.model].$schema.properties, models[b.target].model, b.method, _unique);
          }
        }

        /* istanbul ignore else */
        if (b.params.foreignKey) {
          makeFK(defns[b.target].$schema.properties, a.model, b.method);
          makeFK(conn.models[b.target].options.$schema.properties, a.model, b.method);
        }

        /* istanbul ignore else */
        if (b.method === 'belongsTo') {
          const fixedProp = normalizeProp(prop,
            models[b.target].model.primaryKeyAttribute,
            models[b.target].model.options.underscored);

          const fixedAttrs = a.model.rawAttributes[fixedProp];

          /* istanbul ignore else */
          if (fixedAttrs) {
            makeRef(defns[a.model.name].$schema.properties, prop, fixedAttrs);
            makeRef(conn.models[a.model.name].options.$schema.properties, prop, fixedAttrs);
          }
        }
      }
    });

    return a;
  })
    .filter(x => x)
    .forEach(a => {
      Object.keys(a.model.rawAttributes).forEach(prop => {
        /* istanbul ignore else */
        if (a.model.rawAttributes[prop].references) {
          const refs = a.model.rawAttributes[prop].references;
          const type = a.model.rawAttributes[prop].type;

          /* istanbul ignore else */
          if (!a.model.options.$schema.properties[prop]
            && !defns[a.model.name].$schema.properties[prop]
            && type.options.Model.options.$schema.properties[refs.key]) {
            // append associated refs
            a.model.options.$schema.properties[prop] = defns[a.model.name].$schema.properties[prop] = {
              type: type.options.Model.options.$schema.properties[refs.key].type,
            };
          }
        }

        const b = a.model.rawAttributes[prop];

        /* istanbul ignore else */
        if (a.model.rawAttributes[prop].primaryKey && b.type.options.Model) {
          /* istanbul ignore else */
          if (b.Model !== b.type.options.Model) {
            a.refs[prop] = {
              method: 'belongsTo',
              target: b.type.options.Model.name,
              params: {
                through: b.type.options.Model.name,
                as: prop,
              },
            };

            a.model.options.$schema.required = a.model.options.$schema.required || [];
            a.model.options.$schema.required.push(prop);

            defns[a.model.name].$schema.required = defns[a.model.name].$schema.required || [];
            defns[a.model.name].$schema.required.push(prop);
          }
        }
      });

      Object.keys(a.model.associations).forEach(prop => {
        const assoc = a.model.associations[prop];
        const fields = assoc.target.options.$schema.properties;

        // attach external references
        defns[a.model.name].$dependencies[prop].foreignKeys = [{
          prop: assoc.foreignKey,
          type: fields[assoc.target.primaryKeyAttribute].type,
        }];

        /* istanbul ignore else */
        if (assoc.otherKey) {
          defns[a.model.name].$dependencies[prop].foreignKeys.push({
            prop: assoc.otherKey,
            type: fields[assoc.source.primaryKeyAttribute].type,
          });
        }
      });
    });
}

function sortModels(deps) {
  const weight = {};
  const tree = {};
  const map = {};

  deps.forEach(model => {
    weight[model.name] = weight[model.name] || 0;
    map[model.name] = model;
    tree[model.name] = Object.keys(model.associations)
      .map(ref => ({
        through: model.associations[ref].throughModel,
        name: model.associations[ref].target.name,
      }))
      .reduce((prev, cur) => {
        /* istanbul ignore else */
        if (prev.indexOf(cur.name) === -1) {
          prev.push(cur.name);
        }

        if (!cur.through) {
          weight[model.name] += 1;
        } else {
          weight[cur.through.name] = weight[cur.through.name] || 0;
          weight[cur.through.name] += 1;
        }

        return prev;
      }, []);
  });

  const sortedKeys = Object.keys(tree);

  sortedKeys.forEach(x => {
    const sum = tree[x].reduce((p, c) => p + weight[c], 0);

    /* istanbul ignore else */
    if (sum > weight[x]) {
      weight[x] += sum;
    }
  });

  return sortedKeys
    .sort((a, b) => weight[a] - weight[b])
    .map(x => map[x]);
}

function getDefinition(definition, options, cb) {
  /* istanbul ignore else */
  if (Array.isArray(definition.enum)) {
    return ['ENUM', definition];
  }

  const value = DEFINITIONS[definition.type];

  let result = value;

  /* istanbul ignore else */
  if (options !== false && typeof value === 'function') {
    result = value(options || definition);
  }

  /* istanbul ignore else */
  if (typeof cb === 'function') {
    const x = result;

    result = cb.apply(null, result);
    result[0] = x[0];
    result[1] = x[1];
  }

  /* istanbul ignore else */
  if (result.options && options === null) {
    Object.keys(DEFINITIONS).forEach(key => {
      /* istanbul ignore else */
      if (result.options[key]) {
        result._type = key.toUpperCase();
        result._value = result.options[key];
      }
    });
  }

  /* istanbul ignore else */
  if (typeof result === 'function') {
    result._type = DEFINITIONS[definition.type](definition);
  }

  return result;
}

module.exports = {
  id,
  copy,
  merge,
  mixRefs,
  fixRefs,
  getRefs,
  makeRefs,
  reduceRefs,
  makeModel,
  sortModels,
  getDefinition,
  snakeCase,
  normalizeProp,
};
