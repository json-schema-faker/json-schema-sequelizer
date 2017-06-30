'use strict';

const util = require('./util');

const TYPES = require('sequelize/lib/data-types');

const KEYWORDS = [
  'title', 'default', 'description', 'errors', 'enumNames',
  'definitions', '$ref', 'required', 'pattern', 'format', 'enum',
  'minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum',
  'exclusiveMaximum', 'multipleOf', 'minItems', 'maxItems', 'uniqueItems',
  'patternProperties', 'additionalProperties', 'dependencies', 'not', 'items', 'type',
  'additionalItems', 'allOf', 'oneOf', 'anyOf', 'properties', 'minProperties', 'maxProperties',
];

const PROPERTIES = ['items', 'properties', 'required', 'type', 'id'];

const SUBTYPES = ['range', 'hstore', 'geometry', 'geography', 'virtual'];

function constraintSchema(definition) {
  const schema = util.merge({}, definition);

  schema.validate = schema.validate || {};

  const min = schema.minLength || schema.minimum || undefined;
  const max = schema.maxLength || schema.maximum || undefined;

  /* istanbul ignore else */
  if (schema.type === 'string') {
    /* istanbul ignore else */
    if (min || max) {
      schema.validate.len = [min || 0, max || Infinity];
    }

    /* istanbul ignore else */
    if (schema.pattern) {
      schema.validate.is = new RegExp(schema.pattern, 'i');
    }

    switch (schema.format) {
      case 'email':
        schema.validate.isEmail = true;
        break;

      case 'date-time':
      case 'datetime':
        schema.validate.isDate = true;
        break;

      case 'ipv4':
        schema.validate.isIPv4 = true;
        break;

      case 'ipv6':
        schema.validate.isIPv6 = true;
        break;

      // TODO: hostname uri ...
      default:
        // nothing to do?
    }
  }

  /* istanbul ignore else */
  if (schema.type === 'number' || schema.type === 'integer') {
    /* istanbul ignore else */
    if (schema.type === 'number') {
      schema.validate.isNumeric = true;
    }

    /* istanbul ignore else */
    if (schema.type === 'integer') {
      schema.validate.isInt = true;
    }

    /* istanbul ignore else */
    if (min >= 0) {
      schema.validate.min = min;
    }

    /* istanbul ignore else */
    if (max) {
      schema.validate.max = max;
    }
  }

  KEYWORDS.forEach(key => {
    delete schema[key];
  });

  return schema;
}

function type(key, arg1, arg2) {
  /* istanbul ignore else */
  if (arg2) {
    return TYPES[key](arg1, arg2);
  }

  /* istanbul ignore else */
  if (arg1) {
    return TYPES[key](arg1);
  }

  return TYPES[key]();
}

const definitions = {
  string: definition => {
    switch (definition.format) {
      case 'date-time': return type('DATE');
      case 'date': return type('DATEONLY');
      case 'time': return type('TIME');
      case 'now': return type('NOW');

      case 'json': return type('JSON');
      case 'jsonb': return type('JSONB');
      case 'blob': return type('BLOB', definition);

      case 'uuid':
      case 'uuidv4':
        return type('UUIDV4');

      case 'uuidv1': return type('UUIDV1');

      case 'char': return type('CHAR', definition);
      case 'text': return type('TEXT');

      case 'int64':
      case 'bigint':
        return type('BIGINT', definition);

      case 'int32': return type('STRING', definition);

      case 'number':
        return type('DECIMAL', definition);

      case 'real':
      case 'float':
      case 'double':
      case 'boolean':
      case 'decimal':
        return type(definition.format.toUpperCase(), definition);

      default:
        return type('STRING', definition);
    }
  },

  null: () => type('VIRTUAL'),
  boolean: () => type('BOOLEAN'),

  number: definition => type('DECIMAL', definition),
  integer: definition => type('INTEGER', definition),

  // postgres only
  array: definition => {
    /* istanbul ignore else */
    if (!definition.items
      || !definition.items.type
      || !definitions[definition.items.type]) {
      throw new Error(`Invalid definition for '${JSON.stringify(definition)}'`);
    }

    return type('ARRAY', definitions[definition.items.type](definition.items));
  },
  object: () => type('JSON'),

  // these types cannot be used as, e.g. { "type": "virtual" }
  // because thet are not valid types, instead use:
  // { "type": "number", "virtual": true }
  // { "type": "object", "hstore": true }
  // { "type": "string", "range": true }
  // etc.

  range: () => type('RANGE'),
  hstore: () => type('HSTORE'),
  geometry: () => type('GEOMETRY'),
  geography: () => type('GEOGRAPHY'),

  // virtual types
  virtual: definition => {
    /* istanbul ignore else */
    if (!definition.return) {
      return type('VIRTUAL');
    }

    /* istanbul ignore else */
    if (!definitions[definition.return]) {
      throw new Error(`Unknown definition '${definition.return}'`);
    }

    return type('VIRTUAL', definitions[definition.return](definition), definition.fields || []);
  },
};

function reduceRefs(definition) {
  /* istanbul ignore else */
  if (Array.isArray(definition.allOf)) {
    const schemas = definition.allOf;

    delete definition.allOf;

    schemas.forEach(_definition => {
      util.merge(definition, reduceRefs(_definition));
    });
  }

  return definition;
}

function cleanSchema(definition, parent) {
  /* istanbul ignore else */
  if (typeof definition !== 'object') {
    return definition;
  }

  reduceRefs(definition);

  /* istanbul ignore else */
  if (Array.isArray(definition)) {
    return definition.map(def => cleanSchema(def, parent))
      .filter(value => {
        if (typeof value === 'object' && !Array.isArray(value)) {
          if (!Object.keys(value).length) {
            return false;
          }
        }

        return true;
      });
  }

  /* istanbul ignore else */
  if (parent && typeof definition.id === 'string') {
    const ref = {
      $ref: definition.id,
    };

    // preserve reference details
    Object.keys(definition).forEach(key => {
      if (PROPERTIES.indexOf(key) === -1) {
        ref[key] = definition[key];
      }
    });

    return ref;
  }

  const sub = parent === 'properties' || parent === 'patternProperties';
  const obj = {};

  Object.keys(definition).forEach(key => {
    /* istanbul ignore else */
    if (sub || KEYWORDS.indexOf(key) > -1) {
      obj[key] = typeof definition[key] === 'object' ? cleanSchema(definition[key], key) : definition[key];
    }
  });

  return obj;
}

function convertSchema(definition) {
  reduceRefs(definition);

  // safe-types for JSON-Schema
  for (let i = 0; i < SUBTYPES.length; i += 1) {
    if (definition[SUBTYPES[i]]) {
      return definitions[SUBTYPES[i]](definition);
    }
  }

  /* istanbul ignore else */
  if (Array.isArray(definition.enum)) {
    return TYPES.ENUM.apply(null, definition.enum);
  }

  /* istanbul ignore else */
  if (typeof definitions[definition.type] === 'function' && !definition.id) {
    const _schema = constraintSchema(definition);

    _schema.type = definitions[definition.type](_schema);

    return _schema;
  }

  /* istanbul ignore else */
  if (!definition.properties) {
    return definition;
  }

  const _refs = [];
  const _props = {};

  Object.keys(definition.properties).forEach(key => {
    /* istanbul ignore else */
    if (typeof definition.properties[key] === 'object') {
      if (definition.properties[key].items) {
        _refs.push(util.getRefs(definition.properties[key].items, 'hasMany', key));
      } else if (definition.properties[key].id) {
        _refs.push(util.getRefs(definition.properties[key], 'hasOne', key));
      } else {
        _props[key] = convertSchema(definition.properties[key]);
      }
    }
  });

  return {
    refs: _refs,
    props: _props,
  };
}

module.exports = {
  cleanSchema,
  convertSchema,
  constraintSchema,
};
