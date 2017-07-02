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
      // return util.getDefinition(SUBTYPES[i], definition);
    }
  }

  /* istanbul ignore else */
  if (Array.isArray(definition.enum)) {
    definition.type = TYPES.ENUM.apply(null, definition.enum);

    delete definition.enum;

    return definition;
  }

  /* istanbul ignore else */
  if (!definition.id && typeof util.getDefinition(definition, false) === 'function') {
    const _schema = constraintSchema(definition);

    _schema.type = util.getDefinition(definition, _schema, type);

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
