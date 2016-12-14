'use strict';

const util = require('./util');

const TYPES = require('sequelize/lib/data-types');

const KEYWORDS = [
  'definitions', '$ref', 'required', 'pattern', 'format', 'enum',
  'minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum',
  'exclusiveMaximum', 'multipleOf', 'minItems', 'maxItems', 'uniqueItems',
  'patternProperties', 'additionalProperties', 'dependencies', 'not', 'items', 'type',
  'additionalItems', 'allOf', 'oneOf', 'anyOf', 'properties', 'minProperties', 'maxProperties',
];

function constraintSchema(definition) {
  const schema = util.merge({}, definition);

  schema.validate = schema.validate || {};

  const min = schema.minLength || schema.minimum || undefined;
  const max = schema.maxLength || schema.maximum || undefined;

  if (schema.type === 'string') {
    if (min || max) {
      schema.validate.len = [min || 0, max || Infinity];
    }

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

  if (schema.type === 'number' || schema.type === 'integer') {
    if (schema.type === 'number') {
      schema.validate.isNumeric = true;
    }

    if (schema.type === 'integer') {
      schema.validate.isInt = true;
    }

    if (min >= 0) {
      schema.validate.min = min;
    }

    if (max) {
      schema.validate.max = max;
    }
  }

  KEYWORDS.forEach((key) => {
    delete schema[key];
  });

  return schema;
}

function type(key, arg1, arg2) {
  if (arg2) {
    return TYPES[key](arg1, arg2);
  }

  if (arg1) {
    return TYPES[key](arg1);
  }

  return TYPES[key]();
}

const definitions = {
  string: (definition) => {
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
  array: (definition) => {
    if (!definition.items
      || !definition.items.type
      || !definitions[definition.items.type]) {
      throw new Error(`Invalid definition for '${JSON.stringify(definition)}'`);
    }

    return type('ARRAY', definitions[definition.items.type](definition.items));
  },
  object: () => type('JSON'),
  range: () => type('RANGE'),
  hstore: () => type('HSTORE'),
  geometry: () => type('GEOMETRY'),
  geography: () => type('GEOGRAPHY'),

  // virtual types
  virtual: (definition) => {
    if (!definition.return) {
      return type('VIRTUAL');
    }

    if (!definitions[definition.return]) {
      throw new Error(`Unknown definition '${definition.return}'`);
    }

    return type('VIRTUAL', definitions[definition.return](definition), definition.fields || []);
  },
};

function cleanSchema(definition, parent) {
  if (typeof definition !== 'object') {
    return definition;
  }

  if (Array.isArray(definition)) {
    return definition.map(def => cleanSchema(def, parent))
      .filter((value) => {
        if (typeof value === 'object' && !Array.isArray(value)) {
          if (!Object.keys(value).length) {
            return false;
          }
        }

        return true;
      });
  }

  const sub = parent === 'properties' || parent === 'patternProperties'
  const obj = {};

  Object.keys(definition).forEach((key) => {
    if (sub || KEYWORDS.indexOf(key) > -1) {
      obj[key] = typeof definition[key] === 'object'? cleanSchema(definition[key], key) : definition[key];
    }
  })

  return obj;
}

function convertSchema(definition, reduceCallback) {
  reduceCallback(definition);

  if (Array.isArray(definition.enum)) {
    return TYPES.ENUM.call(null, definition.enum);
  }

  if (typeof definitions[definition.type] === 'function' && !definition.id) {
    const _schema = constraintSchema(definition);

    _schema.type = definitions[definition.type](_schema);

    return _schema;
  }

  if (!definition.properties) {
    return definition;
  }

  const _props = {};

  Object.keys(definition.properties).forEach((key) => {
    if (typeof definition.properties[key] === 'object') {
      _props[key] = convertSchema(definition.properties[key], reduceCallback);
    }
  });

  return _props;
}

module.exports = {
  cleanSchema,
  convertSchema,
  constraintSchema,
};
